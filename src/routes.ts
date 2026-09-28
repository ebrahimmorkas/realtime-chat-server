import { Router } from 'express';
import { env } from './config/env.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { conversationsRouter } from './modules/conversations/conversations.routes.js';
import { messagesRouter } from './modules/messages/messages.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApiRouter() {
  const router = Router();

  router.use(
    createRateLimiter({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      prefix: 'api',
    }),
  );
  // Stricter limit on credential endpoints to slow down brute-force attempts.
  router.use(
    '/auth',
    createRateLimiter({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.AUTH_RATE_LIMIT_MAX,
      prefix: 'auth',
    }),
    authRouter,
  );
  router.use('/users', usersRouter);
  router.use('/conversations', conversationsRouter);
  router.use(messagesRouter);
  return router;
}
