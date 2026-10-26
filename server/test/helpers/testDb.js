// In-memory MongoDB for tests — a real mongod, so $text indexes behave exactly
// as in production. The binary is downloaded once on first run.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;

export async function startTestDb() {
  // Generous launchTimeout: the first mongod exec can be slow (Gatekeeper scans
  // the freshly downloaded binary on macOS); the default 10s can be too tight.
  mem = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mem.getUri());
  return mongoose.connection;
}

export async function stopTestDb() {
  await mongoose.disconnect();
  if (mem) await mem.stop();
}
