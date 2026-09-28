import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { signToken } from '../../src/lib/jwt.js';
import { UserModel } from '../../src/modules/users/user.model.js';

export async function resetDb() {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function createUser(name?: string) {
  const username = (name ?? `user_${randomUUID().slice(0, 8)}`).toLowerCase();
  const user = await UserModel.create({
    username,
    email: `${username}@test.dev`,
    displayName: username,
    passwordHash: await bcrypt.hash('Password123', 4),
  });
  const token = signToken({ id: user.id as string, username: user.username });
  return { user, id: user.id as string, token, auth: { Authorization: `Bearer ${token}` } };
}
