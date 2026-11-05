import { defineConfig } from 'vitest/config';

// Hermetic test env: set deterministic secrets/provider so tests don't depend on
// a developer's .env (which is gitignored and absent in CI). These are read by
// config/env.js when it is first imported inside the test worker.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      LLM_PROVIDER: 'mock',
      AUTH_JWT_SECRET: 'test-secret',
      AUTH_TOKEN_TTL: '8h',
      PROMPT_CANARY: 'trustdesk-canary',
      DEMO_AGENT_PASSWORD: 'agent-pass',
      DEMO_MANAGER_PASSWORD: 'manager-pass',
    },
    // One shared in-memory mongod for the whole run; each file connects to its
    // own database on it (see test/helpers/globalSetup.js + testDb.js).
    globalSetup: ['./test/helpers/globalSetup.js'],
    // Connecting to the already-running shared server is fast; the single binary
    // launch happens once in globalSetup, which has its own generous timeout.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
