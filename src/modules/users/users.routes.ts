import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { NotFound } from '../../lib/errors.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { UserModel, toPublicUser } from './user.model.js';

export const usersRouter = Router();

usersRouter.use(authenticate);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const searchQuery = z.object({
  search: z.string().trim().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

usersRouter.get('/', validate({ query: searchQuery }), async (req, res) => {
  const { search, limit } = req.query as unknown as z.infer<typeof searchQuery>;
  const filter: Record<string, unknown> = { _id: { $ne: req.user!.id } };
  if (search) {
    const prefix = new RegExp(`^${escapeRegex(search)}`, 'i');
    filter.$or = [{ username: prefix }, { displayName: prefix }];
  }
  const users = await UserModel.find(filter).sort({ username: 1 }).limit(limit);
  res.json({ data: users.map(toPublicUser) });
});

usersRouter.get('/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw NotFound('User');
  const user = await UserModel.findById(req.params.id);
  if (!user) throw NotFound('User');
  res.json({ user: toPublicUser(user) });
});
