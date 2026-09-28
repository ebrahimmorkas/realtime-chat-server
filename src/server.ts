import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { closeRedis } from './lib/redis.js';

await connectDb();

const httpServer = createServer(createApp());

httpServer.listen(env.PORT, () => {
  logger.info(`server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down gracefully');
  httpServer.close(async () => {
    await disconnectDb();
    await closeRedis();
    logger.info('shutdown complete');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection'));
