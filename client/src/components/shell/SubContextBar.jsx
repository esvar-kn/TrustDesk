// Operational context strip under the header (Phase 7.0). Shows only facts this
// client actually knows — the session is active and the build mode — plus a
// static label for the deterministic policy engine. The mockup's node / policy
// id / sync-latency telemetry is demo-only and intentionally omitted.
export default function SubContextBar() {
  const mode = import.meta.env.MODE;
  return (
    <div className="w-full bg-surface-container-low border-b border-rule">
      <div className="max-w-7xl mx-auto px-margin py-space-xs flex flex-wrap items-center justify-between gap-space-md mono text-code-sm text-on-surface-variant">
        <div className="flex items-center gap-space-md">
          <span className="flex items-center gap-space-xs">
            <span className="h-2 w-2 rounded-full bg-primary-container animate-pulse" />
            <span className="font-medium text-on-surface">SESSION ACTIVE</span>
          </span>
          <span className="text-outline-variant">/</span>
          <span>
            ENV: <strong className="text-on-surface">{mode}</strong>
          </span>
        </div>
        <span className="px-space-xs py-space-2xs rounded bg-surface-container-highest text-on-surface-variant">
          Deterministic policy engine
        </span>
      </div>
    </div>
  );
}
