import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let client: Redis | null = null;

/**
 * Returns a shared Redis connection, or `null` when Redis is disabled.
 * Every feature that uses Redis must handle the `null` case with a local fallback.
 */
export function getRedis(): Redis | null {
  if (!env.REDIS_ENABLED) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    client.on('error', (err) => logger.error({ err }, 'redis error'));
    client.on('ready', () => logger.info('redis connected'));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
