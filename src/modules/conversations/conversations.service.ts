import { isValidObjectId, Types } from 'mongoose';
import { chatEvents } from '../../lib/chat-events.js';
import { BadRequest, Forbidden, NotFound } from '../../lib/errors.js';
import { unreadCounts } from '../messages/unread.js';
import { UserModel, toPublicUser, type UserDocument } from '../users/user.model.js';
import {
  ConversationModel,
  directKeyFor,
  memberIds,
  refId,
  type ConversationDocument,
} from './conversation.model.js';

export const MAX_GROUP_MEMBERS = 100;

const MEMBER_FIELDS = 'username displayName avatarUrl lastSeenAt';

export function serializeConversation(conversation: ConversationDocument, unreadCount = 0) {
  return {
    id: conversation.id as string,
    type: conversation.type,
    name: conversation.name ?? null,
    createdBy: refId(conversation.createdBy),
    members: conversation.members.map((m) => ({
      user:
        m.user instanceof Types.ObjectId
          ? { id: m.user.toString() }
          : toPublicUser(m.user as unknown as UserDocument),
      role: m.role,
      joinedAt: m.joinedAt,
      lastReadAt: m.lastReadAt,
    })),
    lastMessage: conversation.lastMessage
      ? {
          id: conversation.lastMessage.id,
          text: conversation.lastMessage.text,
          sender: conversation.lastMessage.sender ? refId(conversation.lastMessage.sender) : null,
          createdAt: conversation.lastMessage.createdAt,
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    unreadCount,
  };
}

export type SerializedConversation = ReturnType<typeof serializeConversation>;

async function populated(conversation: ConversationDocument) {
  return conversation.populate({ path: 'members.user', select: MEMBER_FIELDS });
}

/** Loads a conversation, answering 404 (not 403) to non-members so ids can't be probed. */
export async function getConversationForMember(conversationId: string, userId: string) {
  if (!isValidObjectId(conversationId)) throw NotFound('Conversation');
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    'members.user': userId,
  });
  if (!conversation) throw NotFound('Conversation');
  return conversation;
}

function findMember(conversation: ConversationDocument, userId: string) {
  return conversation.members.find((m) => refId(m.user) === userId);
}

function assertGroupAdmin(conversation: ConversationDocument, userId: string) {
  if (conversation.type !== 'group') throw BadRequest('Only group conversations can be managed');
  if (findMember(conversation, userId)?.role !== 'admin') {
    throw Forbidden('Only group admins can do this');
  }
}

async function assertUsersExist(userIds: string[]) {
  if (userIds.some((id) => !isValidObjectId(id))) throw BadRequest('Invalid user id');
  const count = await UserModel.countDocuments({ _id: { $in: userIds } });
  if (count !== userIds.length) throw BadRequest('One or more users do not exist');
}

export async function openDirectConversation(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw BadRequest('You cannot start a conversation with yourself');
  await assertUsersExist([otherUserId]);

  const directKey = directKeyFor(userId, otherUserId);
  const upsert = () =>
    ConversationModel.findOneAndUpdate(
      { directKey },
      {
        $setOnInsert: {
          type: 'direct',
          directKey,
          createdBy: userId,
          members: [
            { user: userId, role: 'member' },
            { user: otherUserId, role: 'member' },
          ],
          lastMessageAt: new Date(),
        },
      },
      { upsert: true, new: true, includeResultMetadata: true },
    );

  let result;
  try {
    result = await upsert();
  } catch (err) {
    // Concurrent upserts can collide on the unique index; the retry finds the winner.
    if ((err as { code?: number }).code !== 11000) throw err;
    result = await upsert();
  }

  const conversation = result.value!;
  const created = !result.lastErrorObject?.updatedExisting;
  const serialized = serializeConversation(await populated(conversation));
  if (created) {
    chatEvents.emit('conversation:created', {
      conversation: serialized,
      memberIds: memberIds(conversation),
    });
  }
  return { conversation: serialized, created };
}

export async function createGroup(userId: string, name: string, memberUserIds: string[]) {
  const others = [...new Set(memberUserIds)].filter((id) => id !== userId);
  if (others.length === 0) throw BadRequest('A group needs at least one other member');
  if (others.length + 1 > MAX_GROUP_MEMBERS) {
    throw BadRequest(`Groups are limited to ${MAX_GROUP_MEMBERS} members`);
  }
  await assertUsersExist(others);

  const conversation = await ConversationModel.create({
    type: 'group',
    name,
    createdBy: userId,
    members: [
      { user: userId, role: 'admin' },
      ...others.map((id) => ({ user: id, role: 'member' as const })),
    ],
  });
  const serialized = serializeConversation(await populated(conversation));
  chatEvents.emit('conversation:created', {
    conversation: serialized,
    memberIds: memberIds(conversation),
  });
  return serialized;
}

export async function getConversation(conversationId: string, userId: string) {
  const conversation = await getConversationForMember(conversationId, userId);
  return serializeConversation(await populated(conversation));
}

export async function renameGroup(conversationId: string, userId: string, name: string) {
  const conversation = await getConversationForMember(conversationId, userId);
  assertGroupAdmin(conversation, userId);
  conversation.name = name;
  await conversation.save();
  const serialized = serializeConversation(await populated(conversation));
  chatEvents.emit('conversation:updated', {
    conversation: serialized,
    memberIds: memberIds(conversation),
  });
  return serialized;
}

export async function addMembers(conversationId: string, userId: string, userIds: string[]) {
  const conversation = await getConversationForMember(conversationId, userId);
  assertGroupAdmin(conversation, userId);

  const existing = new Set(memberIds(conversation));
  const toAdd = [...new Set(userIds)].filter((id) => !existing.has(id));
  if (toAdd.length === 0) return serializeConversation(await populated(conversation));
  if (existing.size + toAdd.length > MAX_GROUP_MEMBERS) {
    throw BadRequest(`Groups are limited to ${MAX_GROUP_MEMBERS} members`);
  }
  await assertUsersExist(toAdd);

  for (const id of toAdd) {
    conversation.members.push({
      user: new Types.ObjectId(id),
      role: 'member',
      joinedAt: new Date(),
      lastReadAt: new Date(),
    });
  }
  await conversation.save();

  const serialized = serializeConversation(await populated(conversation));
  chatEvents.emit('conversation:updated', {
    conversation: serialized,
    memberIds: memberIds(conversation),
  });
  return serialized;
}

/**
 * Removes a member (admin action) or leaves the group (self). If the last admin
 * leaves, the longest-standing member is promoted; an empty group is deleted.
 */
export async function removeMember(conversationId: string, actorId: string, targetId: string) {
  const conversation = await getConversationForMember(conversationId, actorId);
  if (conversation.type !== 'group') throw BadRequest('You cannot leave a direct conversation');
  if (actorId !== targetId) assertGroupAdmin(conversation, actorId);
  if (!findMember(conversation, targetId)) throw NotFound('Member');

  const previousMemberIds = memberIds(conversation);
  const remaining = conversation.members
    .filter((m) => refId(m.user) !== targetId)
    .map((m) => ({ user: m.user, role: m.role, joinedAt: m.joinedAt, lastReadAt: m.lastReadAt }));

  if (remaining.length > 0 && !remaining.some((m) => m.role === 'admin')) {
    const oldest = remaining.reduce((a, b) => (a.joinedAt <= b.joinedAt ? a : b));
    oldest.role = 'admin';
  }

  if (remaining.length === 0) {
    await conversation.deleteOne();
  } else {
    // Replace the whole array so Mongoose issues a single $set (a $pull plus a
    // positional role update on the same array would conflict).
    conversation.set('members', remaining);
    await conversation.save();
  }

  chatEvents.emit('conversation:member-removed', {
    conversationId,
    userId: targetId,
    memberIds: previousMemberIds,
  });
  return { removed: targetId, conversationDeleted: remaining.length === 0 };
}

export async function listConversations(userId: string) {
  const conversations = await ConversationModel.find({ 'members.user': userId })
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .populate({ path: 'members.user', select: MEMBER_FIELDS });

  const counts = await unreadCounts(
    userId,
    conversations.map((c) => ({
      conversationId: c.id as string,
      lastReadAt: findMember(c, userId)!.lastReadAt,
    })),
  );
  return conversations.map((c) => serializeConversation(c, counts.get(c.id as string) ?? 0));
}
