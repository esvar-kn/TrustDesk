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
    // mongodb-memory-server's first boot can be slow; give suites room.
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
