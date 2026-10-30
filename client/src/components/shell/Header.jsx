// App shell header (Phase 7.2): brand, top-level nav, a working global search
// (⌘K focuses it), the guardrails status chip, and the signed-in user.
import { useEffect, useRef } from 'react';
import NotificationsBell from './NotificationsBell.jsx';

// Role-scoped nav (Phase 8.10). No `roles` = visible to everyone. Security is
// enforced server-side; this is least-privilege UX. The oversight surfaces are
// for managers + the read-only auditor; Users is manager-only.
const NAV = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'incidents', label: 'Incidents', roles: ['manager', 'auditor'] },
  { id: 'analytics', label: 'Analytics', roles: ['manager', 'auditor'] },
  { id: 'evaluations', label: 'Evaluations', roles: ['manager', 'auditor'] },
  { id: 'users', label: 'Users', roles: ['manager'] },
];

function initials(name = '') {
  return (
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  );
}

export default function Header({ user, onLogout, view, onNavigate, query, onQuery, dark, onToggleTheme, onOpenTicket }) {
  const searchRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      // Only intercept ⌘K when the search input is actually mounted (xl+);
      // otherwise leave the shortcut to the browser.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-14 bg-surface/95 backdrop-blur border-b border-rule shadow-card">
      <div className="relative h-full max-w-7xl mx-auto px-space-md sm:px-margin flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm shrink-0">
          <img src="/logo-128.png" alt="TrustDesk" className="h-8 w-8 rounded-lg" />
          <span className="hidden sm:block text-headline-lg font-bold tracking-tight">TrustDesk</span>
        </div>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-space-2xs sm:gap-space-xs">
            {NAV.filter((n) => !n.roles || n.roles.includes(user?.role)).map((n) => {
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(n.id)}
                  className={`px-space-sm sm:px-space-md py-space-xs rounded-lg text-body-sm sm:text-body-md whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary-container text-on-primary font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  {n.label}
                </button>
              );
            })}
        </nav>

        <div className="flex items-center gap-space-sm sm:gap-space-md shrink-0">
          <div className="hidden xl:flex items-center gap-space-sm h-9 px-space-md rounded-lg bg-surface-container-low border border-transparent focus-within:border-focus-ring focus-within:bg-surface-container-lowest transition-colors">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search tickets, IDs, customers"
              className="bg-transparent outline-none text-body-sm w-44 text-on-surface placeholder:text-outline"
            />
            <kbd className="mono text-code-sm px-space-xs py-space-2xs rounded bg-surface-container-highest text-on-surface-variant">
              ⌘K
            </kbd>
          </div>

          <span className="hidden 2xl:flex items-center gap-space-xs px-space-sm py-space-2xs rounded bg-surface-container-low">
            <span className="h-2 w-2 rounded-full bg-primary-container" />
            <span className="mono text-code-sm text-on-surface">Guardrails Active</span>
          </span>

          <NotificationsBell onOpenTicket={onOpenTicket} />

          <button
            type="button"
            onClick={onToggleTheme}
            title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={dark}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {dark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {user && (
            <div className="flex items-center gap-space-sm pl-space-xs">
              <span className="flex items-center justify-center h-8 w-8 rounded-full bg-primary-container text-on-primary text-label-sm font-semibold">
                {initials(user.username)}
              </span>
              <div className="hidden sm:flex flex-col items-start leading-none">
                <span className="text-label-sm font-semibold">{user.username}</span>
                <span className="mono text-code-sm text-on-surface-variant mt-space-2xs capitalize">
                  {user.role}
                </span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                title="Sign out"
                aria-label="Sign out"
                className="ml-space-sm flex items-center justify-center h-8 w-8 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
