// Vitest global setup: start ONE in-memory MongoDB for the whole run and hand
// its URI to every test worker via `provide`/`inject`. Previously each test file
// booted its own mongod (8 separate binary launches), which was slow and prone
// to start-up timeouts under parallelism or a cold/partial binary download.
// Now there is a single launch; each file connects to its own database on it
// (see testDb.js), so files stay isolated and can still run in parallel.
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function setup({ provide }) {
  // Generous launchTimeout: the first mongod exec can be slow (e.g. macOS
  // Gatekeeper scanning a freshly downloaded binary).
  const mem = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  provide('mongoUri', mem.getUri());

  // Teardown: stop the shared server once all files have finished.
  return async () => {
    await mem.stop();
  };
}
