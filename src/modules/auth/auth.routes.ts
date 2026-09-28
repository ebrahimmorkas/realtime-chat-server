import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { Conflict, NotFound, Unauthorized } from '../../lib/errors.js';
import { signToken } from '../../lib/jwt.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { UserModel, toPublicUser, type UserDocument } from '../users/user.model.js';

const BCRYPT_ROUNDS = 12;

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,30}$/, 'Username may contain letters, numbers, "_" and "." (3-30 chars)'),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  displayName: z.string().trim().min(1).max(60),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1).describe('Username or email'),
  password: z.string().min(1),
});

const authResponse = (user: UserDocument) => ({
  user: toPublicUser(user),
  token: signToken({ id: user.id as string, username: user.username }),
});

export const authRouter = Router();

authRouter.post('/register', validate({ body: registerSchema }), async (req, res) => {
  const { password, ...data } = req.body as z.infer<typeof registerSchema>;
  const taken = await UserModel.exists({
    $or: [{ username: data.username }, { email: data.email }],
  });
  if (taken) throw Conflict('Username or email is already registered', 'USER_EXISTS');

  const user = await UserModel.create({
    ...data,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });
  res.status(201).json(authResponse(user));
});

authRouter.post('/login', validate({ body: loginSchema }), async (req, res) => {
  const { login, password } = req.body as z.infer<typeof loginSchema>;
  const user = await UserModel.findOne({ $or: [{ username: login }, { email: login }] }).select(
    '+passwordHash',
  );
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw Unauthorized('Invalid credentials');
  }
  res.json(authResponse(user));
});

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await UserModel.findById(req.user!.id);
  if (!user) throw NotFound('User');
  res.json({ user: toPublicUser(user) });
});
