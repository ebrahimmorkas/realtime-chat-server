import type { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { getRedis } from '../lib/redis.js';

/** Per-user fixed-window limiter for WebSocket events (HTTP uses express-rate-limit). */
export interface EventRateLimiter {
  /** Returns true if the action is allowed. */
  consume(key: string): Promise<boolean>;
}

export class MemoryEventRateLimiter implements EventRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string) {
    const now = Date.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    window.count += 1;
    return window.count <= this.limit;
  }
}

export class RedisEventRateLimiter implements EventRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string) {
    const redisKey = `chat:rl:${key}:${Math.floor(Date.now() / this.windowMs)}`;
    const results = (await this.redis
      .multi()
      .incr(redisKey)
      .pexpire(redisKey, this.windowMs)
      .exec()) as [Error | null, number][];
    return (results[0]?.[1] ?? 0) <= this.limit;
  }
}

export function createMessageRateLimiter(): EventRateLimiter {
  const redis = getRedis();
  return redis
    ? new RedisEventRateLimiter(redis, env.MESSAGE_RATE_LIMIT, env.MESSAGE_RATE_WINDOW_MS)
    : new MemoryEventRateLimiter(env.MESSAGE_RATE_LIMIT, env.MESSAGE_RATE_WINDOW_MS);
}
