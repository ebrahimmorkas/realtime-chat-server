import { Types } from 'mongoose';
import { MessageModel } from './message.model.js';

/**
 * Unread counts for many conversations in a single aggregation: messages from
 * other people created after the user's read marker.
 */
export async function unreadCounts(
  userId: string,
  readMarkers: { conversationId: string; lastReadAt: Date }[],
): Promise<Map<string, number>> {
  if (readMarkers.length === 0) return new Map();
  const rows = await MessageModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        sender: { $ne: new Types.ObjectId(userId) },
        deletedAt: null,
        $or: readMarkers.map((m) => ({
          conversation: new Types.ObjectId(m.conversationId),
          createdAt: { $gt: m.lastReadAt },
        })),
      },
    },
    { $group: { _id: '$conversation', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.count]));
}
