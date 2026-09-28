import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { conversationsRouter } from './modules/conversations/conversations.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApiRouter() {
  const router = Router();
  router.use('/auth', authRouter);
  router.use('/users', usersRouter);
  router.use('/conversations', conversationsRouter);
  return router;
}
