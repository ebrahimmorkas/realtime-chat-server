import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { getRedis } from '../lib/redis.js';

interface LimiterOptions {
  windowMs: number;
  max: number;
  prefix: string;
}

/**
 * Creates a rate limiter backed by Redis when enabled (shared across all
 * instances) or by process memory otherwise.
 */
export function createRateLimiter({
  windowMs,
  max,
  prefix,
}: LimiterOptions): RateLimitRequestHandler {
  const redis = getRedis();
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(redis && {
      store: new RedisStore({
        prefix: `chat:http-rl:${prefix}:`,
        sendCommand: (command: string, ...args: string[]) =>
          redis.call(command, ...args) as Promise<RedisReply>,
      }),
    }),
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
      });
    },
  });
}
