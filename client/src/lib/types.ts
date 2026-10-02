// Shapes returned by the Realtime Chat API (REST and Socket.IO).

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
}

export interface Member {
  /** Populated in REST responses; may be just `{ id }` in some socket payloads. */
  user: User | { id: string };
  role: 'admin' | 'member';
  joinedAt: string;
  lastReadAt: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  createdBy: string;
  members: Member[];
  lastMessage: { id: string; text: string | null; sender: string | null; createdAt: string } | null;
  lastMessageAt: string;
  createdAt: string;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  /** `null` once the message is deleted. */
  text: string | null;
  clientId: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  /** Client-only delivery state for optimistic messages. */
  status?: 'sending' | 'failed';
}

export interface MessagePage {
  data: Message[];
  nextCursor: string | null;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type AckResponse<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
