import { isValidObjectId, Types } from 'mongoose';
import { chatEvents } from '../../lib/chat-events.js';
import { BadRequest, Forbidden, NotFound } from '../../lib/errors.js';
import { ConversationModel } from '../conversations/conversation.model.js';
import { getConversationForMember } from '../conversations/conversations.service.js';
import { MessageModel, serializeMessage } from './message.model.js';

const PREVIEW_LENGTH = 120;

export interface SendMessageInput {
  text: string;
  clientId?: string;
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  { text, clientId }: SendMessageInput,
) {
  await getConversationForMember(conversationId, userId);

  if (clientId) {
    const existing = await MessageModel.findOne({ sender: userId, clientId });
    if (existing) return { message: serializeMessage(existing), duplicate: true };
  }

  let message;
  try {
    message = await MessageModel.create({
      conversation: conversationId,
      sender: userId,
      text,
      clientId,
    });
  } catch (err) {
    // A concurrent retry with the same clientId won the race.
    if (clientId && (err as { code?: number }).code === 11000) {
      const existing = await MessageModel.findOne({ sender: userId, clientId });
      if (existing) return { message: serializeMessage(existing), duplicate: true };
    }
    throw err;
  }

  const createdAt = message.createdAt;
  await ConversationModel.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessage: {
          id: message.id,
          text: text.slice(0, PREVIEW_LENGTH),
          sender: userId,
          createdAt,
        },
        lastMessageAt: createdAt,
        'members.$[me].lastReadAt': createdAt,
      },
    },
    { arrayFilters: [{ 'me.user': new Types.ObjectId(userId) }] },
  );

  const serialized = serializeMessage(message);
  chatEvents.emit('message:created', { conversationId, message: serialized });
  return { message: serialized, duplicate: false };
}

export async function listMessages(
  userId: string,
  conversationId: string,
  { before, limit }: { before?: string; limit: number },
) {
  await getConversationForMember(conversationId, userId);
  if (before && !isValidObjectId(before)) throw BadRequest('Invalid cursor');

  const messages = await MessageModel.find({
    conversation: conversationId,
    ...(before && { _id: { $lt: before } }),
  })
    .sort({ _id: -1 })
    .limit(limit + 1);

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit);
  return {
    data: page.map(serializeMessage),
    nextCursor: hasMore ? (page.at(-1)!.id as string) : null,
  };
}

async function findOwnMessage(userId: string, messageId: string) {
  if (!isValidObjectId(messageId)) throw NotFound('Message');
  const message = await MessageModel.findById(messageId);
  if (!message || message.deletedAt) throw NotFound('Message');
  // The sender must still be a member of the conversation.
  await getConversationForMember(message.conversation.toString(), userId);
  if (message.sender.toString() !== userId)
    throw Forbidden('You can only modify your own messages');
  return message;
}

export async function editMessage(userId: string, messageId: string, text: string) {
  const message = await findOwnMessage(userId, messageId);
  message.text = text;
  message.editedAt = new Date();
  await message.save();

  const serialized = serializeMessage(message);
  chatEvents.emit('message:updated', {
    conversationId: serialized.conversationId,
    message: serialized,
  });
  return serialized;
}

/** Soft delete: keeps the message's place in history but removes its content. */
export async function deleteMessage(userId: string, messageId: string) {
  const message = await findOwnMessage(userId, messageId);
  message.text = '';
  message.deletedAt = new Date();
  await message.save();

  const conversationId = message.conversation.toString();
  await ConversationModel.updateOne(
    { _id: conversationId, 'lastMessage.id': message.id },
    { $set: { 'lastMessage.text': '' } },
  );
  chatEvents.emit('message:deleted', { conversationId, messageId: message.id as string });
}

/** Moves the caller's read marker forward (never backwards). */
export async function markRead(userId: string, conversationId: string) {
  await getConversationForMember(conversationId, userId);
  const lastReadAt = new Date();
  await ConversationModel.updateOne(
    { _id: conversationId },
    { $max: { 'members.$[me].lastReadAt': lastReadAt } },
    { arrayFilters: [{ 'me.user': new Types.ObjectId(userId) }] },
  );
  chatEvents.emit('conversation:read', { conversationId, userId, lastReadAt });
  return { conversationId, lastReadAt };
}
