import { EventEmitter } from 'node:events';

/**
 * In-process domain events. Services publish here; the realtime layer
 * subscribes and fans events out to sockets. This keeps HTTP handlers and
 * business logic unaware of Socket.IO.
 */
export interface ChatEventMap {
  'conversation:created': { conversation: { id: string }; memberIds: string[] };
  'conversation:updated': { conversation: { id: string }; memberIds: string[] };
  'conversation:member-removed': { conversationId: string; userId: string; memberIds: string[] };
  'message:created': { conversationId: string; message: unknown };
  'message:updated': { conversationId: string; message: unknown };
  'message:deleted': { conversationId: string; messageId: string };
  'conversation:read': { conversationId: string; userId: string; lastReadAt: Date };
}

type Listener<K extends keyof ChatEventMap> = (payload: ChatEventMap[K]) => void;

class ChatEvents {
  private emitter = new EventEmitter();

  emit<K extends keyof ChatEventMap>(event: K, payload: ChatEventMap[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof ChatEventMap>(event: K, listener: Listener<K>) {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  removeAllListeners() {
    this.emitter.removeAllListeners();
  }
}

export const chatEvents = new ChatEvents();
