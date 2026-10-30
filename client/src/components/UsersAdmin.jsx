// User administration (Phase 8.8). Manager-only: list users, create a user with a
// role (agent / manager / auditor), change a role, or remove a user. Auditor is
// the read-only role. Wired to the manager-gated /api/users endpoints.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, btnPrimary, btnOutline, btnDanger, Banner } from './ui.jsx';
import { Badge } from './Badges.jsx';

const ROLES = ['agent', 'manager', 'auditor'];
const ROLE_TONE = { agent: 'neutral', manager: 'escalated', auditor: 'teal' };
const ROLE_DESC = {
  agent: 'Triage, draft, request actions',
  manager: 'Approve / execute + user admin',
  auditor: 'Read-only — view everything, change nothing',
};

export default function UsersAdmin({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ username: '', role: 'agent', password: '' });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api('/users'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function op(key, fn) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const create = () =>
    op('create', async () => {
      await api('/users', { method: 'POST', body: { ...form, username: form.username.trim() } });
      setForm({ username: '', role: 'agent', password: '' });
    });

  const changeRole = (username, role) =>
    op(`role-${username}`, () => api(`/users/${username}`, { method: 'PATCH', body: { role } }));

  const remove = (username) =>
    op(`del-${username}`, () => api(`/users/${username}`, { method: 'DELETE' }));

  const canCreate = form.username.trim() && form.password.length >= 6;

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col gap-space-2xs">
        <h1 className="flex items-center gap-space-sm text-headline-lg font-semibold">
          <span className="material-symbols-outlined text-[22px] text-primary-container">group</span>
          User Management
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Create accounts and assign roles. The auditor role is read-only.
        </p>
      </div>

      {error && <Banner tone="blocked">{error}</Banner>}

      <Card>
        <CardHead icon="person_add" title="Add user" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-space-md items-end">
          <label className="flex flex-col gap-space-2xs">
            <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">Username</span>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="e.g. auditor"
              className="h-10 rounded-md border border-rule bg-surface-container-lowest px-space-md text-body-md outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30"
            />
          </label>
          <label className="flex flex-col gap-space-2xs">
            <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">Role</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="h-10 rounded-md border border-rule bg-surface-container-lowest px-space-md text-body-md outline-none focus:border-focus-ring"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-space-2xs">
            <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="min 6 characters"
              className="h-10 rounded-md border border-rule bg-surface-container-lowest px-space-md text-body-md outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30"
            />
          </label>
          <button className={btnPrimary} onClick={create} disabled={!canCreate || busy === 'create'}>
            <span className="material-symbols-outlined text-[16px]">add</span>
            {busy === 'create' ? 'Creating…' : 'Create user'}
          </button>
        </div>
        <p className="text-body-sm text-on-surface-variant mt-space-sm">{ROLE_DESC[form.role]}</p>
      </Card>

      <Card>
        <CardHead icon="group" title="Users">
          <span className="mono text-code-sm text-on-surface-variant">{users.length} total</span>
        </CardHead>
        {loading ? (
          <p className="text-body-md text-on-surface-variant">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-space-sm">
            {users.map((u) => {
              const isSelf = u.username === user?.username;
              return (
                <li
                  key={u.username}
                  className="flex flex-wrap items-center justify-between gap-space-sm rounded-md border border-rule bg-surface-container-lowest p-space-md"
                >
                  <span className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
                    <span className="font-semibold">{u.username}</span>
                    {isSelf && <span className="mono text-code-sm text-outline">you</span>}
                    <Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge>
                  </span>
                  <div className="flex items-center gap-space-sm">
                    <select
                      value={u.role}
                      disabled={isSelf || busy === `role-${u.username}`}
                      onChange={(e) => changeRole(u.username, e.target.value)}
                      className="h-8 rounded-md border border-rule bg-surface-container-lowest px-space-sm text-body-sm outline-none focus:border-focus-ring disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      className={btnDanger}
                      disabled={isSelf || busy === `del-${u.username}`}
                      onClick={() => remove(u.username)}
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
