import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: () => new Date() },
    lastReadAt: { type: Date, default: () => new Date(0) },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    name: { type: String, trim: true, maxlength: 80, default: null },
    /**
     * Sorted "userA:userB" pair for direct chats. The unique (sparse) index makes
     * "find or create DM" race-safe: two users opening a chat at the same time
     * cannot create duplicates.
     */
    directKey: { type: String, default: undefined },
    members: { type: [memberSchema], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessage: {
      type: new Schema(
        {
          id: String,
          text: String,
          sender: { type: Schema.Types.ObjectId, ref: 'User' },
          createdAt: Date,
        },
        { _id: false },
      ),
      default: null,
    },
    lastMessageAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

conversationSchema.index({ directKey: 1 }, { unique: true, sparse: true });
conversationSchema.index({ 'members.user': 1, lastMessageAt: -1 });

export type Conversation = InferSchemaType<typeof conversationSchema>;
export type ConversationDocument = HydratedDocument<Conversation>;

export const ConversationModel = model('Conversation', conversationSchema);

export const directKeyFor = (a: string, b: string) => [a, b].sort().join(':');

/** Returns the string id of a ref, whether or not it has been populated. */
export const refId = (ref: unknown): string =>
  ref instanceof Types.ObjectId ? ref.toString() : String((ref as { _id: unknown })._id);

export const memberIds = (conversation: Pick<Conversation, 'members'>) =>
  conversation.members.map((m) => refId(m.user));
