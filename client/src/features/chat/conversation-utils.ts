import type { Conversation, Member, Message, User } from '@/lib/types';

export const isFullUser = (user: Member['user']): user is User => 'username' in user;

export function otherMember(conversation: Conversation, meId: string) {
  return conversation.members.find((m) => m.user.id !== meId);
}

export function conversationTitle(conversation: Conversation, meId: string) {
  if (conversation.type === 'group') return conversation.name ?? 'Group';
  const other = otherMember(conversation, meId)?.user;
  return other && isFullUser(other) ? other.displayName : 'Direct message';
}

export function memberName(conversation: Conversation, userId: string) {
  const user = conversation.members.find((m) => m.user.id === userId)?.user;
  return user && isFullUser(user) ? user.displayName : 'Someone';
}

export const firstName = (name: string) => name.split(' ')[0] ?? name;

/**
 * Members other than the sender who have read up to this message. Read state
 * is per conversation (`lastReadAt`), so a message is "seen" by everyone whose
 * marker is at or after it.
 */
export function seenBy(conversation: Conversation, message: Message) {
  const sentAt = new Date(message.createdAt).getTime();
  return conversation.members.filter(
    (m) => m.user.id !== message.senderId && new Date(m.lastReadAt).getTime() >= sentAt,
  );
}

/** Text for "Alice is typing…" style indicators. */
export function typingLabel(conversation: Conversation, userIds: string[]) {
  const names = userIds.map((id) => firstName(memberName(conversation, id)));
  if (names.length === 0) return null;
  if (conversation.type === 'direct') return 'typing…';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}
