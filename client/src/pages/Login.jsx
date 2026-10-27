import { useState } from 'react';
import { login } from '../api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('agent');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(username.trim(), password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1>TrustDesk</h1>
        <p className="muted">Sign in to the support workspace</p>

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="banner error">{error}</div>}

        <button type="submit" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small">Demo users: agent, manager</p>
      </form>
    </div>
  );
}
