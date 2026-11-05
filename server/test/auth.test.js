// Auth tests, end-to-end over the real Express app (no supertest; Node fetch).
// Covers login (success + generic 401), the Bearer-token guard, and role gating.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/testDb.js';
import { seedTestDb } from './helpers/seedTestDb.js';
import { startApp } from './helpers/httpApp.js';
import User from '../src/models/User.js';

let app;

beforeAll(async () => {
  await startTestDb();
  await seedTestDb();
  app = await startApp();
}, 120000);

afterAll(async () => {
  await app.stop();
  await stopTestDb();
});

async function login(username, password) {
  return app.post('/api/auth/login', { body: { username, password } });
}

describe('POST /api/auth/login', () => {
  it('returns a token and role for valid credentials', async () => {
    const res = await login('agent', 'agent-pass');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('agent');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
  });

  it('issues a manager token for the manager user', async () => {
    const res = await login('manager', 'manager-pass');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('manager');
  });

  it('returns a generic 401 for a wrong password', async () => {
    const res = await login('agent', 'nope');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the same generic 401 for an unknown user (no enumeration)', async () => {
    const res = await login('ghost', 'whatever');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed body with a 400', async () => {
    const res = await app.post('/api/auth/login', { body: { username: 'agent' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('requireAuth', () => {
  it('401s a protected route with no bearer token', async () => {
    const res = await app.get('/api/tool-actions');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401s an invalid/garbage token', async () => {
    const res = await app.get('/api/tool-actions', { token: 'not.a.jwt' });
    expect(res.status).toBe(401);
  });

  it('allows a valid token through', async () => {
    const { body } = await login('agent', 'agent-pass');
    const res = await app.get('/api/tool-actions', { token: body.token });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('requireRole', () => {
  it('403s an agent on a manager-only route', async () => {
    const { body } = await login('agent', 'agent-pass');
    const res = await app.post('/api/tool-actions/act_missing/approve', {
      token: body.token,
      body: { decision: 'approved' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets a manager past the role gate', async () => {
    const { body } = await login('manager', 'manager-pass');
    // Manager clears the role gate; the action id is missing, so the service
    // rejects with INVALID_STATE (409) — not a 403.
    const res = await app.post('/api/tool-actions/act_missing/approve', {
      token: body.token,
      body: { decision: 'approved' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

// These mutate the seeded users, so they run last (they use the spare agent2 /
// manager2 accounts that earlier tests don't touch).
describe('account re-validation (stale token)', () => {
  it('401s when the account was deleted after the token was issued', async () => {
    const { body } = await login('agent2', 'agent2-pass');
    await User.deleteOne({ username: 'agent2' });
    const res = await app.get('/api/tool-actions', { token: body.token });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('re-reads the role from the DB, not the (now stale) token claim', async () => {
    const { body } = await login('manager2', 'manager2-pass');
    // Demote in the DB; the issued token still claims the manager role.
    await User.updateOne({ username: 'manager2' }, { $set: { role: 'agent' } });
    const res = await app.post('/api/tool-actions/act_missing/approve', {
      token: body.token,
      body: { decision: 'approved' },
    });
    // Blocked by the manager gate despite the manager token.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('tool-action create validation', () => {
  it('400s when idempotency_key is missing from the payload', async () => {
    const { body } = await login('agent', 'agent-pass');
    const res = await app.post('/api/tool-actions', {
      token: body.token,
      body: {
        ticket_id: 'tkt_9001',
        tool_name: 'create_replacement_order',
        payload: { order_id: 'ord_5001' },
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
