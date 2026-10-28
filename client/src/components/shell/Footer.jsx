// App shell footer (Phase 7.0).
const YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="w-full border-t border-rule bg-surface">
      <div className="max-w-7xl mx-auto px-margin py-space-sm flex flex-wrap items-center justify-between gap-space-sm text-body-sm text-on-surface-variant">
        <span>TrustDesk · Deterministic Audit Engine</span>
        <span className="mono text-code-sm">© {YEAR} TrustDesk · Provable AI Operations</span>
      </div>
    </footer>
  );
}
