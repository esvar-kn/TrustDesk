import { useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, btnOutline, Banner } from './ui.jsx';
import { Badge } from './Badges.jsx';

const DECISION = {
  answer: { tone: 'safe', icon: 'check_circle' },
  escalate: { tone: 'escalated', icon: 'arrow_outward' },
  refuse: { tone: 'blocked', icon: 'block' },
};

export default function DraftPanel({ ticketId, onDrafted }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cite, setCite] = useState(null);
  const [citeBusy, setCiteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/tickets/${ticketId}/draft-reply`, { method: 'POST' });
      setRes(r);
      setCite(null);
      onDrafted?.(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCite(id) {
    if (cite?.doc_id === id) {
      setCite(null);
      return;
    }
    setCiteBusy(true);
    try {
      setCite(await api(`/documents/${id}`));
    } catch (e) {
      setCite({ doc_id: id, title: id, error: e.message, chunks: [] });
    } finally {
      setCiteBusy(false);
    }
  }

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const draft = res?.draft;
  const activeFlags = Object.entries(res?.flags || {})
    .filter(([k, v]) => v && k !== 'any')
    .map(([k]) => k);
  const guardItems = [...activeFlags, ...(draft?.violations || [])];
  const dec = draft && (DECISION[draft.decision] || { tone: 'neutral', icon: 'description' });
  const flagged = Boolean(res?.flags?.any);

  return (
    <Card>
      <CardHead icon={flagged ? 'shield' : 'draft'} title={flagged ? 'AI Draft Holding Reply' : 'AI Draft Reply'}>
        <div className="flex items-center gap-space-sm">
          {flagged && <Badge tone="pending" icon="shield">Safe fallback mode</Badge>}
          <Badge tone="neutral">{res?.prompt_version || 'draft.v1'}</Badge>
          <button className={btnOutline} onClick={run} disabled={busy}>
            <span className="material-symbols-outlined text-[16px]">autorenew</span>
            {busy ? 'Drafting…' : draft ? 'Regenerate' : 'Draft reply'}
          </button>
        </div>
      </CardHead>

      {error && <Banner tone="blocked">{error}</Banner>}

      {!draft ? (
        <p className="text-body-md text-on-surface-variant">
          No draft yet — generate a cited reply through the guarded pipeline.
        </p>
      ) : (
        <div className="flex flex-col gap-space-md">
          <div className="flex items-center justify-between gap-space-md">
            <Badge tone={dec.tone} icon={dec.icon}>
              {draft.decision}
            </Badge>
            {draft.body && (
              <button className={btnOutline} onClick={copyReply}>
                <span className="material-symbols-outlined text-[16px]">
                  {copied ? 'done' : 'content_copy'}
                </span>
                {copied ? 'Copied' : 'Copy reply'}
              </button>
            )}
          </div>

          {guardItems.length > 0 && (
            <Banner tone="blocked">Guardrails flagged: {guardItems.join(', ')}</Banner>
          )}

          {flagged && (
            <span className="inline-flex items-center gap-space-xs text-body-sm text-status-safe-fg">
              <span className="material-symbols-outlined text-[16px]">verified_user</span>
              Zero prompt leakage confirmed
            </span>
          )}

          <blockquote className="px-space-md py-space-sm rounded-md bg-surface-container-low border-l-[3px] border-primary-container whitespace-pre-wrap leading-relaxed text-body-lg">
            {draft.body}
          </blockquote>

          {draft.citations?.length > 0 && (
            <div className="flex flex-col gap-space-sm">
              <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                Citations
              </span>
              <div className="flex flex-wrap gap-space-xs">
                {draft.citations.map((id) => (
                  <button
                    key={id}
                    onClick={() => toggleCite(id)}
                    className={`mono text-code-md px-space-sm py-space-2xs rounded border transition-colors ${
                      cite?.doc_id === id
                        ? 'bg-primary-container text-on-primary border-primary-container'
                        : 'bg-surface-container-low text-primary-container border-rule hover:bg-surface-container'
                    }`}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {citeBusy && <p className="text-body-sm text-on-surface-variant">Loading citation…</p>}
          {cite && (
            <div className="rounded-md bg-surface-container-low border border-rule border-l-[3px] border-l-primary-container p-space-md max-h-60 overflow-y-auto">
              <strong className="text-body-md">{cite.title || cite.doc_id}</strong>
              {cite.error ? (
                <p className="text-body-sm text-on-surface-variant mt-space-xs">{cite.error}</p>
              ) : (
                (cite.chunks || []).map((c, i) => (
                  <div key={i} className="mt-space-sm">
                    {c.heading && <div className="text-body-sm font-semibold">{c.heading}</div>}
                    <div className="text-body-sm text-on-surface-variant">{c.text}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
