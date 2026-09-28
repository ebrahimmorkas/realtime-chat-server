import type { Redis } from 'ioredis';
import { getRedis } from '../lib/redis.js';

/**
 * Tracks which users are online. A user may have several sockets (tabs,
 * devices), so they only go offline when their last socket disconnects.
 */
export interface PresenceStore {
  /** Returns true if this connection brought the user online. */
  connect(userId: string, socketId: string): Promise<boolean>;
  /** Returns true if this disconnection took the user offline. */
  disconnect(userId: string, socketId: string): Promise<boolean>;
  onlineAmong(userIds: string[]): Promise<string[]>;
}

export class MemoryPresenceStore implements PresenceStore {
  private sockets = new Map<string, Set<string>>();

  async connect(userId: string, socketId: string) {
    const set = this.sockets.get(userId) ?? new Set<string>();
    set.add(socketId);
    this.sockets.set(userId, set);
    return set.size === 1;
  }

  async disconnect(userId: string, socketId: string) {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size > 0) return false;
    this.sockets.delete(userId);
    return true;
  }

  async onlineAmong(userIds: string[]) {
    return userIds.filter((id) => this.sockets.has(id));
  }
}

/** Shared presence for multi-instance deployments: one Redis set of socket ids per user. */
export class RedisPresenceStore implements PresenceStore {
  // Safety net so sockets of a crashed instance don't keep users "online" forever.
  private static readonly TTL_SECONDS = 24 * 60 * 60;

  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'chat:presence',
  ) {}

  private key(userId: string) {
    return `${this.prefix}:${userId}`;
  }

  async connect(userId: string, socketId: string) {
    const results = (await this.redis
      .multi()
      .sadd(this.key(userId), socketId)
      .expire(this.key(userId), RedisPresenceStore.TTL_SECONDS)
      .scard(this.key(userId))
      .exec()) as [Error | null, number][];
    return results[2]?.[1] === 1;
  }

  async disconnect(userId: string, socketId: string) {
    const results = (await this.redis
      .multi()
      .srem(this.key(userId), socketId)
      .scard(this.key(userId))
      .exec()) as [Error | null, number][];
    const [removed, remaining] = results.map(([, value]) => value);
    return removed === 1 && remaining === 0;
  }

  async onlineAmong(userIds: string[]) {
    if (userIds.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of userIds) pipeline.exists(this.key(id));
    const results = (await pipeline.exec()) as [Error | null, number][];
    return userIds.filter((_, i) => results[i]?.[1] === 1);
  }
}

export function createPresenceStore(): PresenceStore {
  const redis = getRedis();
  return redis ? new RedisPresenceStore(redis) : new MemoryPresenceStore();
}
