import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Supports prefix search on username/display name for the "start a chat" picker.
userSchema.index({ displayName: 1 });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model('User', userSchema);

export function toPublicUser(user: UserDocument) {
  return {
    id: user.id as string,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    lastSeenAt: user.lastSeenAt ?? null,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
