import { afterAll, beforeAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED ??= 'false';
process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-definitely-long-enough';
process.env.MESSAGE_RATE_LIMIT = '5';
process.env.MONGO_URL = process.env.TEST_MONGO_URL ?? 'mongodb://localhost:27017/chat_test';

const { connectDb, disconnectDb } = await import('../src/lib/db.js');

beforeAll(async () => {
  await connectDb();
});

afterAll(async () => {
  await disconnectDb();
});
