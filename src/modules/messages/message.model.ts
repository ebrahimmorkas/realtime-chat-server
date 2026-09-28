import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const MAX_MESSAGE_LENGTH = 4000;

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, maxlength: MAX_MESSAGE_LENGTH, default: '' },
    /**
     * Optional client-generated id. Clients resend unacknowledged messages after
     * a reconnect; the unique index turns those retries into no-ops.
     */
    clientId: { type: String, default: undefined },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Cursor pagination: newest first within a conversation.
messageSchema.index({ conversation: 1, _id: -1 });
// Partial (not sparse) index: a sparse compound index would still index every
// document because `sender` is always present.
messageSchema.index(
  { sender: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
);

export type Message = InferSchemaType<typeof messageSchema>;
export type MessageDocument = HydratedDocument<Message>;

export const MessageModel = model('Message', messageSchema);

export function serializeMessage(message: MessageDocument) {
  const deleted = Boolean(message.deletedAt);
  return {
    id: message.id as string,
    conversationId: message.conversation.toString(),
    senderId: message.sender.toString(),
    text: deleted ? null : message.text,
    clientId: message.clientId ?? null,
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    deleted,
  };
}

export type SerializedMessage = ReturnType<typeof serializeMessage>;
