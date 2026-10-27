// Starts the real Express app on an ephemeral port and exposes a tiny fetch
// client, so routes/middleware are exercised end-to-end with no new deps
// (Node 22 has global fetch).
import { createApp } from '../../src/app.js';

export async function startApp() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  async function req(method, pathname, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + pathname, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, body: json, headers: res.headers };
  }

  return {
    server,
    get: (p, o) => req('GET', p, o),
    post: (p, o) => req('POST', p, o),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
