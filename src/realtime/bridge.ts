import type { Server } from 'socket.io';
import { chatEvents } from '../lib/chat-events.js';
import {
  conversationRoom,
  userRoom,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from './types.js';

type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Forwards domain events to connected clients. Room operations such as
 * `socketsJoin` go through the adapter, so with the Redis adapter they reach
 * sockets connected to any instance.
 */
export function bridgeChatEvents(io: ChatServer): () => void {
  const subscriptions = [
    chatEvents.on('message:created', ({ conversationId, message }) => {
      io.to(conversationRoom(conversationId)).emit('message:new', message);
    }),
    chatEvents.on('message:updated', ({ conversationId, message }) => {
      io.to(conversationRoom(conversationId)).emit('message:updated', message);
    }),
    chatEvents.on('message:deleted', (payload) => {
      io.to(conversationRoom(payload.conversationId)).emit('message:deleted', payload);
    }),
    chatEvents.on('conversation:created', ({ conversation, memberIds }) => {
      const members = memberIds.map(userRoom);
      io.in(members).socketsJoin(conversationRoom(conversation.id));
      io.to(members).emit('conversation:new', conversation);
    }),
    chatEvents.on('conversation:updated', ({ conversation, memberIds }) => {
      const members = memberIds.map(userRoom);
      // Newly added members start receiving the conversation's messages immediately.
      io.in(members).socketsJoin(conversationRoom(conversation.id));
      io.to(members).emit('conversation:updated', conversation);
    }),
    chatEvents.on('conversation:member-removed', ({ conversationId, userId, memberIds }) => {
      io.in(userRoom(userId)).socketsLeave(conversationRoom(conversationId));
      io.to(memberIds.map(userRoom)).emit('conversation:member-removed', {
        conversationId,
        userId,
      });
    }),
    chatEvents.on('conversation:read', (payload) => {
      io.to(conversationRoom(payload.conversationId)).emit('conversation:read', payload);
    }),
  ];
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
