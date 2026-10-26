// MongoDB connection helper. Defined in Phase 1.0; wired into server startup
// in Phase 1.1. Kept out of app.js so the HTTP app can be tested without a DB.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongo connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'));

  await mongoose.connect(uri);
  logger.info('mongo connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  logger.info('mongo disconnected (clean)');
}
