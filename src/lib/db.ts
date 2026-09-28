import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(url = env.MONGO_URL): Promise<void> {
  await mongoose.connect(url, { serverSelectionTimeoutMS: 5000 });
  logger.info('mongodb connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function dbStatus(): 'up' | 'down' {
  return mongoose.connection.readyState === 1 ? 'up' : 'down';
}
