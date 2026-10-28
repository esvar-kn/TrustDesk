// App shell header (Phase 7.2): brand, top-level nav, a working global search
// (⌘K focuses it), the guardrails status chip, and the signed-in user.
import { useEffect, useRef } from 'react';

const NAV = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'evaluations', label: 'Evaluations' },
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

export default function Header({ user, onLogout, view, onNavigate, query, onQuery }) {
  const searchRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-14 bg-surface/95 backdrop-blur border-b border-rule shadow-card">
      <div className="h-full max-w-7xl mx-auto px-space-md sm:px-margin flex items-center justify-between gap-space-sm sm:gap-space-lg">
        <div className="flex items-center gap-space-sm sm:gap-space-lg min-w-0">
          <div className="flex items-center gap-space-md shrink-0">
            <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary-container text-on-primary">
              <span className="material-symbols-outlined text-[20px]">verified_user</span>
            </span>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-headline-sm font-semibold tracking-tight">TrustDesk</span>
              <span className="mono text-code-sm text-on-surface-variant mt-space-2xs">
                AI Support Operations · Audit First
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-space-2xs sm:gap-space-xs">
            {NAV.map((n) => {
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
        </div>

        <div className="flex items-center gap-space-sm sm:gap-space-md shrink-0">
          <div className="hidden md:flex items-center gap-space-sm h-9 px-space-md rounded-lg bg-surface-container-low border border-transparent focus-within:border-focus-ring focus-within:bg-surface-container-lowest transition-colors">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search tickets, IDs, customers"
              className="bg-transparent outline-none text-body-sm w-48 text-on-surface placeholder:text-outline"
            />
            <kbd className="mono text-code-sm px-space-xs py-space-2xs rounded bg-surface-container-highest text-on-surface-variant">
              ⌘K
            </kbd>
          </div>

          <span className="hidden lg:flex items-center gap-space-xs px-space-sm py-space-2xs rounded bg-surface-container-low">
            <span className="h-2 w-2 rounded-full bg-primary-container" />
            <span className="mono text-code-sm text-on-surface">Guardrails Active</span>
          </span>

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
