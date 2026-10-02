import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/features/auth/auth-context';
import { API_URL, api, ApiError, session } from '@/lib/api';
import type { AckResponse, Conversation, Message } from '@/lib/types';
import {
  applyMessageChange,
  applyNewMessage,
  applyRead,
  conversationKeys,
  patchMessage,
  removeMember,
  upsertConversation,
  upsertMessage,
  type MessagesData,
} from './cache';
import { liveStore } from './live-store';

interface ServerToClientEvents {
  'session:ready': (p: { userId: string; onlineContacts: string[] }) => void;
  'message:new': (m: Message) => void;
  'message:updated': (m: Message) => void;
  'message:deleted': (p: { conversationId: string; messageId: string }) => void;
  'conversation:new': (c: Conversation) => void;
  'conversation:updated': (c: Conversation) => void;
  'conversation:member-removed': (p: { conversationId: string; userId: string }) => void;
  'conversation:read': (p: { conversationId: string; userId: string; lastReadAt: string }) => void;
  typing: (p: { conversationId: string; userId: string; isTyping: boolean }) => void;
  'presence:update': (p: { userId: string; online: boolean; lastSeenAt?: string }) => void;
}

interface ClientToServerEvents {
  'message:send': (
    p: { conversationId: string; text: string; clientId: string },
    ack: (r: AckResponse<Message>) => void,
  ) => void;
  'conversation:read': (
    p: { conversationId: string },
    ack: (r: AckResponse<{ conversationId: string; lastReadAt: string }>) => void,
  ) => void;
  'typing:start': (p: { conversationId: string }) => void;
  'typing:stop': (p: { conversationId: string }) => void;
}

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ACK_TIMEOUT_MS = 8000;

interface SocketContextValue {
  /** Sends over the socket, or over REST while disconnected. Safe to retry with the same clientId. */
  sendMessage: (conversationId: string, text: string, clientId: string) => Promise<Message>;
  markRead: (conversationId: string) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  setActiveConversation: (conversationId: string | null) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function unwrap<T>(response: AckResponse<T>): T {
  if (response.ok) return response.data;
  throw new ApiError(400, response.error.message, response.error.code);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<ChatSocket | null>(null);
  const activeRef = useRef<string | null>(null);
  const meId = user?.id;

  const markReadVia = useCallback(
    (s: ChatSocket | null, conversationId: string) => {
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (list) =>
        list?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
      if (s?.connected) {
        s.timeout(ACK_TIMEOUT_MS).emit('conversation:read', { conversationId }, () => {});
      } else {
        void api(`/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!token || !meId) return;
    const s: ChatSocket = io(API_URL || undefined, { auth: { token } });
    let hadConnected = false;

    const setConversations = (
      fn: (list: Conversation[] | undefined) => Conversation[] | undefined,
    ) => queryClient.setQueryData<Conversation[]>(conversationKeys.all, fn);
    // Only touch histories that are already loaded; others are fetched when opened.
    const setMessages = (id: string, fn: (d: MessagesData) => MessagesData | undefined) =>
      queryClient.setQueryData<MessagesData>(conversationKeys.messages(id), (d) => (d ? fn(d) : d));

    s.on('connect', () => {
      liveStore.setConnection('connected');
      // After a reconnect, catch up on anything that happened while we were away.
      if (hadConnected) {
        void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['messages'] });
      }
      hadConnected = true;
    });
    s.on('disconnect', () => liveStore.setConnection('reconnecting'));
    s.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') session.set(null);
      else liveStore.setConnection(hadConnected ? 'reconnecting' : 'offline');
    });

    s.on('session:ready', ({ onlineContacts }) => liveStore.setOnline(onlineContacts));
    s.on('presence:update', ({ userId, online, lastSeenAt }) =>
      liveStore.setPresence(userId, online, lastSeenAt),
    );
    s.on('typing', ({ conversationId, userId, isTyping }) =>
      liveStore.setTyping(conversationId, userId, isTyping),
    );

    s.on('message:new', (message) => {
      liveStore.setTyping(message.conversationId, message.senderId, false);
      setMessages(message.conversationId, (d) => upsertMessage(d, message));
      const known = queryClient
        .getQueryData<Conversation[]>(conversationKeys.all)
        ?.some((c) => c.id === message.conversationId);
      if (!known) void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
      setConversations((list) =>
        applyNewMessage(list, message, { meId, activeId: activeRef.current }),
      );
      const reading =
        message.conversationId === activeRef.current && document.visibilityState === 'visible';
      if (reading && message.senderId !== meId) markReadVia(s, message.conversationId);
    });
    s.on('message:updated', (message) => {
      setMessages(message.conversationId, (d) => upsertMessage(d, message));
      setConversations((list) => applyMessageChange(list, message));
    });
    s.on('message:deleted', ({ conversationId, messageId }) => {
      setMessages(conversationId, (d) =>
        patchMessage(d, (m) => m.id === messageId, { deleted: true, text: null }),
      );
      setConversations((list) =>
        list?.map((c) =>
          c.id === conversationId && c.lastMessage?.id === messageId
            ? { ...c, lastMessage: { ...c.lastMessage, text: null } }
            : c,
        ),
      );
    });

    s.on('conversation:new', (c) => setConversations((list) => upsertConversation(list, c)));
    s.on('conversation:updated', (c) => setConversations((list) => upsertConversation(list, c)));
    s.on('conversation:member-removed', (payload) =>
      setConversations((list) => removeMember(list, payload, meId)),
    );
    s.on('conversation:read', (payload) =>
      setConversations((list) => applyRead(list, payload, meId)),
    );

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      liveStore.reset();
    };
  }, [token, meId, queryClient, markReadVia]);

  const value = useMemo<SocketContextValue>(
    () => ({
      async sendMessage(conversationId, text, clientId) {
        if (socket?.connected) {
          const response = await socket
            .timeout(ACK_TIMEOUT_MS)
            .emitWithAck('message:send', { conversationId, text, clientId });
          return unwrap(response);
        }
        const { message } = await api<{ message: Message }>(
          `/conversations/${conversationId}/messages`,
          { method: 'POST', body: { text, clientId } },
        );
        return message;
      },
      markRead: (conversationId) => markReadVia(socket, conversationId),
      setTyping(conversationId, isTyping) {
        if (socket?.connected)
          socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId });
      },
      setActiveConversation(conversationId) {
        activeRef.current = conversationId;
      },
    }),
    [socket, markReadVia],
  );

  return <SocketContext value={value}>{children}</SocketContext>;
}

export function useChatSocket() {
  const ctx = use(SocketContext);
  if (!ctx) throw new Error('useChatSocket must be used inside <SocketProvider>');
  return ctx;
}
