import { useSyncExternalStore } from 'react';

/**
 * Ephemeral real-time state that doesn't belong in the query cache: who is
 * online, who is typing where, and whether the socket is connected.
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

/** A typing indicator expires if the "stop" event is lost (e.g. the sender went offline). */
export const TYPING_TTL_MS = 6000;

interface LiveState {
  connection: ConnectionStatus;
  online: ReadonlySet<string>;
  lastSeen: Readonly<Record<string, string>>;
  /** conversationId → userId → expiry timestamp */
  typing: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

const initial: LiveState = {
  connection: 'connecting',
  online: new Set(),
  lastSeen: {},
  typing: {},
};

let state = initial;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function set(next: LiveState) {
  state = next;
  listeners.forEach((l) => l());
}

export const liveStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  reset() {
    timers.forEach(clearTimeout);
    timers.clear();
    set(initial);
  },
  setConnection(connection: ConnectionStatus) {
    if (state.connection !== connection) set({ ...state, connection });
  },
  setOnline(userIds: string[]) {
    set({ ...state, online: new Set(userIds) });
  },
  setPresence(userId: string, online: boolean, lastSeenAt?: string) {
    const next = new Set(state.online);
    if (online) next.add(userId);
    else next.delete(userId);
    set({
      ...state,
      online: next,
      lastSeen: lastSeenAt ? { ...state.lastSeen, [userId]: lastSeenAt } : state.lastSeen,
    });
  },
  setTyping(conversationId: string, userId: string, isTyping: boolean) {
    const key = `${conversationId}:${userId}`;
    clearTimeout(timers.get(key));
    timers.delete(key);
    const forConversation = { ...state.typing[conversationId] };
    if (isTyping) {
      forConversation[userId] = Date.now() + TYPING_TTL_MS;
      timers.set(
        key,
        setTimeout(() => liveStore.setTyping(conversationId, userId, false), TYPING_TTL_MS),
      );
    } else {
      delete forConversation[userId];
    }
    set({ ...state, typing: { ...state.typing, [conversationId]: forConversation } });
  },
};

export function useLive<T>(selector: (s: LiveState) => T): T {
  return useSyncExternalStore(liveStore.subscribe, () => selector(liveStore.get()));
}

const EMPTY: string[] = [];
const typingCache = new Map<string, { source: object; ids: string[] }>();

/** User ids typing in a conversation; referentially stable while nothing changes. */
export function useTypingUsers(conversationId: string) {
  return useLive((s) => {
    const source = s.typing[conversationId];
    if (!source) return EMPTY;
    const cached = typingCache.get(conversationId);
    if (cached?.source === source) return cached.ids;
    const ids = Object.keys(source);
    typingCache.set(conversationId, { source, ids });
    return ids;
  });
}

export const useIsOnline = (userId: string | undefined) =>
  useLive((s) => (userId ? s.online.has(userId) : false));
