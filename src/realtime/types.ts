import type { AuthUser } from '../lib/jwt.js';

export type AckResponse<T = unknown> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export type Ack<T = unknown> = (response: AckResponse<T>) => void;

export interface ClientToServerEvents {
  'message:send': (payload: unknown, ack?: Ack) => void;
  'typing:start': (payload: unknown) => void;
  'typing:stop': (payload: unknown) => void;
  'conversation:read': (payload: unknown, ack?: Ack) => void;
  'presence:query': (payload: unknown, ack?: Ack) => void;
}

export interface ServerToClientEvents {
  'session:ready': (payload: { userId: string; onlineContacts: string[] }) => void;
  'message:new': (message: unknown) => void;
  'message:updated': (message: unknown) => void;
  'message:deleted': (payload: { conversationId: string; messageId: string }) => void;
  'conversation:new': (conversation: unknown) => void;
  'conversation:updated': (conversation: unknown) => void;
  'conversation:member-removed': (payload: { conversationId: string; userId: string }) => void;
  'conversation:read': (payload: {
    conversationId: string;
    userId: string;
    lastReadAt: Date;
  }) => void;
  typing: (payload: { conversationId: string; userId: string; isTyping: boolean }) => void;
  'presence:update': (payload: { userId: string; online: boolean; lastSeenAt?: Date }) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  user: AuthUser;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
