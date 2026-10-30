import { useState } from 'react';
import { api } from '../api.js';
import { Card, CardHead, btnOutline, btnPrimary, Banner } from './ui.jsx';
import { Badge } from './Badges.jsx';

// Conversation thread (Phase 8.1). Renders every turn of a ticket; a legacy
// single-message ticket is shown as one customer turn. Agents can log an inbound
// customer follow-up, which the server re-scans through the guardrail pipeline.
function turnsOf(ticket) {
  if (Array.isArray(ticket.messages) && ticket.messages.length) return ticket.messages;
  // Synthesize a single customer turn for a legacy ticket.
  return [
    {
      message_id: 'original',
      role: 'customer',
      body: ticket.body,
      created_at: ticket.created_at,
      flags: null,
    },
  ];
}

function Turn({ msg }) {
  const [copied, setCopied] = useState(false);
  const isAgent = msg.role === 'agent';
  const flagged = Boolean(msg.flags?.any);

  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.body || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-space-2xs">
      <div className="flex items-center justify-between gap-space-sm">
        <span className="flex items-center gap-space-xs text-label-sm uppercase tracking-wide text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">
            {isAgent ? 'support_agent' : 'person'}
          </span>
          {isAgent ? 'Agent reply' : 'Customer'}
          {!isAgent && (
            <span className="flex items-center gap-space-2xs normal-case tracking-normal text-outline">
              <span className="material-symbols-outlined text-[12px]">lock</span>
              unchanged
            </span>
          )}
          {flagged && <Badge tone="blocked" icon="gpp_maybe">flagged</Badge>}
        </span>
        <button className={btnOutline} onClick={copy}>
          <span className="material-symbols-outlined text-[16px]">{copied ? 'done' : 'content_copy'}</span>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <blockquote
        className={`px-space-md py-space-sm rounded-md whitespace-pre-wrap leading-relaxed text-body-lg border-l-[3px] ${
          isAgent
            ? 'bg-surface-container-low border-primary-container'
            : flagged
              ? 'bg-status-blocked-bg/40 border-status-blocked-outline'
              : 'bg-surface-container-low border-outline-variant'
        }`}
      >
        {msg.body}
      </blockquote>
      {msg.created_at && (
        <span className="mono text-code-sm text-on-surface-variant">{msg.created_at}</span>
      )}
    </div>
  );
}

export default function ConversationThread({ ticket, onChanged, readOnly = false }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const turns = turnsOf(ticket);

  async function addReply() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/tickets/${ticket.ticket_id}/messages`, {
        method: 'POST',
        body: { body, role: 'customer' },
      });
      setDraft('');
      setOpen(false);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead icon="forum" title="Conversation">
        <span className="mono text-code-sm text-on-surface-variant">
          {turns.length} {turns.length === 1 ? 'message' : 'messages'} · via {ticket.channel || 'n/a'}
        </span>
      </CardHead>

      <div className="flex flex-col gap-space-md">
        {turns.map((m) => (
          <Turn key={m.message_id} msg={m} />
        ))}
      </div>

      {error && <div className="mt-space-md"><Banner tone="blocked">{error}</Banner></div>}

      {!readOnly && (
      <div className="mt-space-md border-t border-rule pt-space-md">
        {!open ? (
          <button className={btnOutline} onClick={() => setOpen(true)}>
            <span className="material-symbols-outlined text-[16px]">reply</span>
            Add customer reply
          </button>
        ) : (
          <div className="flex flex-col gap-space-sm">
            <label className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Inbound customer follow-up (re-scanned by guardrails)
            </label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Type the customer's next message…"
              className="w-full rounded-md bg-surface-container-lowest border border-rule px-space-md py-space-sm text-body-lg text-on-surface placeholder:text-outline outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/40"
            />
            <div className="flex items-center gap-space-sm">
              <button className={btnPrimary} disabled={busy || !draft.trim()} onClick={addReply}>
                <span className="material-symbols-outlined text-[16px]">send</span>
                {busy ? 'Adding…' : 'Add to conversation'}
              </button>
              <button
                className={btnOutline}
                onClick={() => {
                  setOpen(false);
                  setDraft('');
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </Card>
  );
}
