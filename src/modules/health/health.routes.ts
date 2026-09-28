import { Router } from 'express';
import { dbStatus } from '../../lib/db.js';
import { getRedis } from '../../lib/redis.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const redis = getRedis();
  let redisStatus = 'disabled';
  if (redis) {
    redisStatus = await redis
      .ping()
      .then(() => 'up')
      .catch(() => 'down');
  }
  const mongo = dbStatus();

  res.status(mongo === 'up' ? 200 : 503).json({
    status: mongo === 'up' ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    services: { mongo, redis: redisStatus },
  });
});
