import type { InfiniteData } from '@tanstack/react-query';
import type { Conversation, Message, MessagePage } from '@/lib/types';

/**
 * Pure helpers that fold server events into the TanStack Query cache.
 *
 * Messages are cached newest-first per conversation (the API's page order).
 * The same message can arrive up to three times: the optimistic copy, the
 * send acknowledgement and the `message:new` broadcast. Matching on `id` or
 * `clientId` makes every update idempotent.
 */

export type MessagesData = InfiniteData<MessagePage, unknown>;

export const conversationKeys = {
  all: ['conversations'] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
};

const sameMessage = (a: Message, b: Message) =>
  a.id === b.id || (a.clientId !== null && a.clientId === b.clientId);

export function upsertMessage(data: MessagesData | undefined, message: Message): MessagesData {
  if (!data) {
    return { pages: [{ data: [message], nextCursor: null }], pageParams: [null] };
  }
  let found = false;
  const pages = data.pages.map((page) => ({
    ...page,
    data: page.data.map((m) => {
      if (!sameMessage(m, message)) return m;
      found = true;
      // Never let a late optimistic copy overwrite the confirmed one.
      return m.status === undefined && message.status !== undefined ? m : message;
    }),
  }));
  if (found) return { ...data, pages };
  const [first, ...rest] = pages;
  return { ...data, pages: [{ ...first!, data: [message, ...first!.data] }, ...rest] };
}

export function patchMessage(
  data: MessagesData | undefined,
  match: (m: Message) => boolean,
  patch: Partial<Message>,
): MessagesData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.map((m) => (match(m) ? { ...m, ...patch } : m)),
    })),
  };
}

/** Oldest-first list of every loaded message, for rendering. */
export const flattenMessages = (data: MessagesData | undefined): Message[] =>
  data ? data.pages.flatMap((p) => p.data).toReversed() : [];

const byRecentActivity = (a: Conversation, b: Conversation) =>
  new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();

export function upsertConversation(
  list: Conversation[] | undefined,
  conversation: Conversation,
): Conversation[] | undefined {
  if (!list) return list;
  const existing = list.find((c) => c.id === conversation.id);
  // Socket payloads don't know our unread count; keep the one we have.
  const merged = existing ? { ...conversation, unreadCount: existing.unreadCount } : conversation;
  return [merged, ...list.filter((c) => c.id !== conversation.id)].sort(byRecentActivity);
}

export function applyNewMessage(
  list: Conversation[] | undefined,
  message: Message,
  { meId, activeId }: { meId: string; activeId: string | null },
): Conversation[] | undefined {
  if (!list) return list;
  const target = list.find((c) => c.id === message.conversationId);
  if (!target) return list;
  // Ignore duplicates (ack + broadcast) of the message already shown as the latest one.
  const alreadyLatest = target.lastMessage?.id === message.id;
  const unread = message.senderId !== meId && message.conversationId !== activeId && !alreadyLatest;
  const updated: Conversation = {
    ...target,
    lastMessage: {
      id: message.id,
      text: message.text,
      sender: message.senderId,
      createdAt: message.createdAt,
    },
    lastMessageAt: message.createdAt,
    unreadCount: unread ? target.unreadCount + 1 : target.unreadCount,
  };
  return [updated, ...list.filter((c) => c.id !== target.id)].sort(byRecentActivity);
}

export function applyMessageChange(list: Conversation[] | undefined, message: Message) {
  if (!list) return list;
  return list.map((c) =>
    c.id === message.conversationId && c.lastMessage?.id === message.id
      ? { ...c, lastMessage: { ...c.lastMessage, text: message.text } }
      : c,
  );
}

export function applyRead(
  list: Conversation[] | undefined,
  {
    conversationId,
    userId,
    lastReadAt,
  }: { conversationId: string; userId: string; lastReadAt: string },
  meId: string,
): Conversation[] | undefined {
  if (!list) return list;
  return list.map((c) =>
    c.id !== conversationId
      ? c
      : {
          ...c,
          unreadCount: userId === meId ? 0 : c.unreadCount,
          members: c.members.map((m) => (m.user.id === userId ? { ...m, lastReadAt } : m)),
        },
  );
}

export function removeMember(
  list: Conversation[] | undefined,
  { conversationId, userId }: { conversationId: string; userId: string },
  meId: string,
): Conversation[] | undefined {
  if (!list) return list;
  if (userId === meId) return list.filter((c) => c.id !== conversationId);
  return list.map((c) =>
    c.id === conversationId ? { ...c, members: c.members.filter((m) => m.user.id !== userId) } : c,
  );
}
