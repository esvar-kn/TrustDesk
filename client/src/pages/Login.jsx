import { useRef, useState } from 'react';
import { login } from '../api.js';

// Demo roles. We prefill the username and focus the password — the real demo
// passwords live in the server's .env and are never embedded in the client.
const DEMO = [
  { username: 'agent', label: 'Agent Demo', desc: 'L2 Tier Support' },
  { username: 'manager', label: 'Manager Demo', desc: 'Audit & Policy' },
  { username: 'auditor', label: 'Auditor Demo', desc: 'Read-only oversight' },
];

export default function Login({ onLogin, dark, onToggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onLogin(await login(username.trim(), password));
    } catch (err) {
      // On the login screen, UNAUTHENTICATED means bad credentials — not an
      // expired session (the global mapping in api.js).
      setError(err.code === 'UNAUTHENTICATED' ? 'Invalid username or password.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  function pickRole(name) {
    setUsername(name);
    setPassword('');
    setError(null);
    pwRef.current?.focus();
  }

  const fieldWrap =
    'flex items-center gap-space-sm h-10 px-space-md rounded-md bg-surface-container-lowest border border-rule focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/40 transition-colors';
  const inputCls =
    'flex-1 bg-transparent outline-none text-body-lg text-on-surface placeholder:text-outline';

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-margin py-space-2xl gap-space-lg">
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-pressed={dark}
          className="fixed top-space-lg right-space-lg flex items-center justify-center h-9 w-9 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">
            {dark ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      )}
      <span className="flex items-center gap-space-xs px-space-md py-space-2xs rounded-full bg-surface-container text-on-surface-variant mono text-code-sm">
        <span className="h-2 w-2 rounded-full bg-primary-container" />
        TrustDesk · AI Operations Console
      </span>

      <form
        onSubmit={submit}
        className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl border border-rule shadow-card overflow-hidden"
      >
        <div className="h-1 bg-primary-container" />
        <div className="p-space-2xl flex flex-col gap-space-lg">
          <div className="flex flex-col items-center gap-space-md text-center">
            <img src="/logo-128.png" alt="TrustDesk" className="h-12 w-12 rounded-xl" />
            <div className="flex flex-col gap-space-2xs">
              <h1 className="text-headline-xl font-semibold tracking-tight">TrustDesk</h1>
              <p className="text-label-sm font-semibold tracking-wide text-primary-container uppercase">
                AI support you can audit
              </p>
            </div>
            <p className="text-body-md text-on-surface-variant max-w-[320px]">
              Support-operations console with policy verification and human oversight.
            </p>
          </div>

          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between">
              <label htmlFor="identifier" className="text-label-md font-medium text-on-surface-variant">
                Work Email or Username
              </label>
              <span className="mono text-code-sm text-outline">Local</span>
            </div>
            <div className={fieldWrap}>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">mail</span>
              <input
                id="identifier"
                className={inputCls}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Enter your work email or username"
              />
            </div>
          </div>

          <div className="flex flex-col gap-space-xs">
            <label htmlFor="password" className="text-label-md font-medium text-on-surface-variant">
              Password
            </label>
            <div className={fieldWrap}>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">lock</span>
              <input
                id="password"
                ref={pwRef}
                className={inputCls}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPw ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded-md bg-status-blocked-bg border border-status-blocked-outline text-status-blocked-fg text-body-md">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="flex items-center justify-center gap-space-sm h-11 rounded-lg bg-primary-container text-on-primary font-semibold text-body-lg hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-default"
          >
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
          </button>

          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <span className="text-label-sm font-semibold tracking-wide text-on-surface-variant uppercase">
                Demo Credentials
              </span>
              <span className="mono text-code-sm text-outline">JWT session</span>
            </div>
            <div className={fieldWrap}>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">badge</span>
              <select
                aria-label="Demo role"
                value={DEMO.some((d) => d.username === username) ? username : ''}
                onChange={(e) => e.target.value && pickRole(e.target.value)}
                className="flex-1 bg-transparent outline-none text-body-lg text-on-surface"
              >
                <option value="" disabled>
                  Select a demo role…
                </option>
                {DEMO.map((d) => (
                  <option key={d.username} value={d.username}>
                    {d.label} — {d.desc}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Pick a role to fill the username, then enter its demo password.
            </p>
          </div>
        </div>
      </form>

      <div className="flex items-center gap-space-sm px-space-lg py-space-sm rounded-lg bg-surface-container text-on-surface-variant text-body-sm">
        <span className="material-symbols-outlined text-[18px] text-primary-container">verified_user</span>
        Policy checks · Human approval gates · Guardrail pipeline
      </div>
      <p className="mono text-code-sm text-outline">
        Policy engine: deterministic · Retrieval: MongoDB $text
      </p>
    </div>
  );
}
