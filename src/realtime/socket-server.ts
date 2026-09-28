import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, type Socket } from 'socket.io';
import { z, ZodError } from 'zod';
import { corsOrigin } from '../app.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { ConversationModel } from '../modules/conversations/conversation.model.js';
import { sendMessageSchema } from '../modules/messages/messages.schemas.js';
import { markRead, sendMessage } from '../modules/messages/messages.service.js';
import { UserModel } from '../modules/users/user.model.js';
import { bridgeChatEvents } from './bridge.js';
import { createPresenceStore } from './presence.js';
import { createMessageRateLimiter } from './rate-limiter.js';
import {
  conversationRoom,
  userRoom,
  type Ack,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from './types.js';

type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const conversationPayload = z.object({ conversationId: objectId });
const socketMessageSchema = sendMessageSchema.extend({ conversationId: objectId });
const presenceQuery = z.object({ userIds: z.array(objectId).max(200) });

function toAckError(err: unknown) {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  if (err instanceof ZodError) {
    return { code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid payload' };
  }
  logger.error({ err }, 'socket handler failed');
  return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

/** Wraps a handler so every call is acknowledged with `{ ok, data }` or `{ ok, error }`. */
function withAck<T>(handler: (payload: unknown) => Promise<T>) {
  return async (payload: unknown, ack?: Ack) => {
    try {
      const data = await handler(payload);
      if (typeof ack === 'function') ack({ ok: true, data });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: toAckError(err) });
    }
  };
}

async function contactIdsOf(userId: string): Promise<string[]> {
  const conversations = await ConversationModel.find(
    { 'members.user': userId },
    { 'members.user': 1 },
  ).lean();
  const ids = new Set<string>();
  for (const c of conversations) for (const m of c.members) ids.add(m.user.toString());
  ids.delete(userId);
  return [...ids];
}

export interface SocketServerHandle {
  io: ChatServer;
  close: () => Promise<void>;
}

export function createSocketServer(httpServer: HttpServer): SocketServerHandle {
  const io: ChatServer = new Server(httpServer, {
    cors: { origin: corsOrigin },
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  let pubClient: Redis | undefined;
  let subClient: Redis | undefined;
  if (env.REDIS_ENABLED) {
    pubClient = new Redis(env.REDIS_URL);
    subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('socket.io using redis adapter');
  }

  const presence = createPresenceStore();
  const messageLimiter = createMessageRateLimiter();
  const unbridge = bridgeChatEvents(io);
  // In-flight async socket work, awaited on shutdown before Redis clients close.
  const pending = new Set<Promise<void>>();
  const track = (work: Promise<void>) => {
    pending.add(work);
    void work.finally(() => pending.delete(work));
  };

  io.use((socket, next) => {
    const header = socket.handshake.headers.authorization;
    const token =
      (socket.handshake.auth as { token?: string } | undefined)?.token ??
      (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: ChatSocket) => {
    const { user } = socket.data;

    // Handlers are registered synchronously so no early client event is lost.
    socket.on(
      'message:send',
      withAck(async (payload) => {
        const input = socketMessageSchema.parse(payload);
        if (!(await messageLimiter.consume(`msg:${user.id}`))) {
          throw new AppError(429, 'You are sending messages too fast', 'RATE_LIMITED');
        }
        const { message } = await sendMessage(user.id, input.conversationId, {
          text: input.text,
          clientId: input.clientId,
        });
        return message;
      }),
    );

    const typing = (isTyping: boolean) => (payload: unknown) => {
      const parsed = conversationPayload.safeParse(payload);
      if (!parsed.success) return;
      const room = conversationRoom(parsed.data.conversationId);
      // Room membership doubles as the authorization check.
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing', {
        conversationId: parsed.data.conversationId,
        userId: user.id,
        isTyping,
      });
    };
    socket.on('typing:start', typing(true));
    socket.on('typing:stop', typing(false));

    socket.on(
      'conversation:read',
      withAck(async (payload) => {
        const { conversationId } = conversationPayload.parse(payload);
        return markRead(user.id, conversationId);
      }),
    );

    socket.on(
      'presence:query',
      withAck(async (payload) => {
        const { userIds } = presenceQuery.parse(payload);
        return { online: await presence.onlineAmong(userIds) };
      }),
    );

    const handleDisconnect = async () => {
      try {
        if (!(await presence.disconnect(user.id, socket.id))) return;
        const lastSeenAt = new Date();
        await UserModel.updateOne({ _id: user.id }, { lastSeenAt });
        const contacts = await contactIdsOf(user.id);
        if (contacts.length > 0) {
          io.to(contacts.map(userRoom)).emit('presence:update', {
            userId: user.id,
            online: false,
            lastSeenAt,
          });
        }
      } catch (err) {
        logger.error({ err }, 'socket disconnect handling failed');
      }
    };
    socket.on('disconnect', () => track(handleDisconnect()));

    track(
      (async () => {
        try {
          const conversations = await ConversationModel.find(
            { 'members.user': user.id },
            { _id: 1 },
          ).lean();
          await socket.join([
            userRoom(user.id),
            ...conversations.map((c) => conversationRoom(c._id.toString())),
          ]);

          const contacts = await contactIdsOf(user.id);
          const cameOnline = await presence.connect(user.id, socket.id);
          if (socket.disconnected) {
            // The client left while we were setting up; undo the presence entry.
            await presence.disconnect(user.id, socket.id);
            return;
          }
          if (cameOnline && contacts.length > 0) {
            io.to(contacts.map(userRoom)).emit('presence:update', {
              userId: user.id,
              online: true,
            });
          }
          socket.emit('session:ready', {
            userId: user.id,
            onlineContacts: await presence.onlineAmong(contacts),
          });
        } catch (err) {
          logger.error({ err }, 'socket setup failed');
          socket.disconnect(true);
        }
      })(),
    );
  });

  return {
    io,
    close: async () => {
      unbridge();
      await io.close();
      await Promise.allSettled([...pending]);
      await Promise.all([pubClient?.quit(), subClient?.quit()]);
    },
  };
}
