// Connects a test file to the shared in-memory MongoDB started once in
// globalSetup.js. Each file connects to its OWN database (unique name) on that
// single mongod, so files are isolated — seedTestDb()'s deleteMany() wipes only
// this file's data — while still sharing one real mongod ($text indexes behave
// exactly as in production, with no per-file binary launch).
import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import mongoose from 'mongoose';

export async function startTestDb() {
  const uri = inject('mongoUri');
  if (!uri) throw new Error('mongoUri was not provided by globalSetup');
  // A per-file database name keeps parallel files from colliding on the shared
  // server. Mongoose is a per-worker singleton, so one connection per file.
  await mongoose.connect(uri, { dbName: `test_${randomUUID().slice(0, 8)}` });
  return mongoose.connection;
}

export async function stopTestDb() {
  // Only disconnect this worker; globalSetup stops the shared server at the end.
  await mongoose.disconnect();
}
