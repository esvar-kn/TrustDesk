// Security-middleware tests (no DB): helmet headers and CORS are applied by the
// app, and the env layer fails fast in production when AUTH_JWT_SECRET is unset.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { startApp } from './helpers/httpApp.js';

let app;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.stop();
});

describe('security headers', () => {
  it('sets helmet headers on responses', async () => {
    const res = await app.get('/api/health');
    // Representative helmet defaults — enough to prove the middleware ran.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-dns-prefetch-control')).toBe('off');
    // helmet hides Express's framework fingerprint.
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('reflects the configured CORS origin for an allowed origin', async () => {
    // cors only emits Access-Control-Allow-Origin when the request carries a
    // matching Origin, so send one. Default CORS_ORIGIN is the dev client origin.
    const port = app.server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('does not allow an unlisted CORS origin', async () => {
    const port = app.server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'http://evil.example' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('production secret enforcement', () => {
  it('exits non-zero at boot when AUTH_JWT_SECRET is missing in production', () => {
    const run = () =>
      execFileSync(process.execPath, ['-e', "import('./src/config/env.js')"], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          AUTH_JWT_SECRET: '',
          LLM_PROVIDER: 'mock',
        },
        stdio: 'pipe',
      });
    expect(run).toThrow();
  });

  it('boots in production when AUTH_JWT_SECRET is set', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', "import('./src/config/env.js').then(() => console.log('ok'))"],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          AUTH_JWT_SECRET: 'prod-secret',
          LLM_PROVIDER: 'mock',
        },
        stdio: 'pipe',
      },
    );
    expect(out.toString()).toContain('ok');
  });
});
