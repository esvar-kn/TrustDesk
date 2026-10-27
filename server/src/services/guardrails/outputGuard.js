// Output guard: the last line of defence over whatever the model returns.
// It filters citations to trusted docs, injects the policy's required docs,
// drops any action not on the policy allowlist, escalates when policy says so,
// replaces leaking bodies, and flags forbidden promises / unsupported answers.
import { env } from '../../config/env.js';

// Claims the model must never make (they require human approval first).
const PROMISE_RE =
  /(has been|have been|already|successfully)\s+(refunded|replaced|shipped|processed|issued)|refund (is )?complete|money back to your|replacement has shipped/i;

// Obvious secret-ish tokens that should never appear in a reply.
const KEYLIKE_RE = /\b(sk-[a-z0-9]{8,}|gsk_[a-z0-9]{8,}|AIza[0-9A-Za-z_-]{10,})\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

function toSet(v) {
  return v instanceof Set ? v : new Set(v || []);
}

function refusalBody() {
  return 'I’m not able to action that request here. I’ve escalated this ticket to a human specialist who will review it and follow up.';
}

// True if the body leaks the canary, a configured secret, a key-like token, or
// an email address other than the ticket customer's.
function leaks(body, ctx) {
  const text = String(body || '');
  const canary = ctx.canary ?? env.PROMPT_CANARY;
  if (canary && text.includes(canary)) return true;
  if (env.AUTH_JWT_SECRET && text.includes(env.AUTH_JWT_SECRET)) return true;
  if (env.LLM_API_KEY && text.includes(env.LLM_API_KEY)) return true;
  if (/api[ _-]?key\s*[:=]/i.test(text)) return true;
  if (KEYLIKE_RE.test(text)) return true;
  const customerEmail = (ctx.customer?.email || '').toLowerCase();
  const emails = (text.match(EMAIL_RE) || []).map((e) => e.toLowerCase());
  if (emails.some((e) => e !== customerEmail)) return true;
  return false;
}

function ensureAction(actions, tool_name, reason) {
  if (!actions.some((a) => a.tool_name === tool_name)) actions.push({ tool_name, reason });
  return actions;
}

// guardDraft(out, ctx) -> { decision, body, citations, actions, violations }
// ctx: { trustedDocIds, policy:{ allowed[], requiredDocs[], escalate[] },
//        knownTools?, customer, canary }
export function guardDraft(out, ctx) {
  const violations = [];
  const trusted = toSet(ctx.trustedDocIds);
  const allowed = toSet(ctx.policy?.allowed);
  const knownTools = ctx.knownTools ? toSet(ctx.knownTools) : null;

  // 1) Citations: keep only trusted docs.
  let citations = (out.citations || []).filter((id) => trusted.has(id));
  if (citations.length < (out.citations || []).length) violations.push('citation_not_allowed');

  // 2) Inject required docs that are actually available (trusted + retrieved).
  for (const id of ctx.policy?.requiredDocs || []) {
    if (trusted.has(id) && !citations.includes(id)) citations.push(id);
  }

  // 3) Actions: keep only known tools that are on the policy allowlist.
  let actions = (out.recommended_actions || []).filter(
    (a) => (!knownTools || knownTools.has(a.tool_name)) && allowed.has(a.tool_name),
  );
  if (actions.length < (out.recommended_actions || []).length) violations.push('action_blocked');

  let decision = out.decision;
  let body = out.body;

  // 4) Policy escalation always wins.
  if ((ctx.policy?.escalate || []).length) {
    decision = 'escalate';
    actions = ensureAction(actions, 'escalate_to_human', 'Policy requires human review.');
  }

  // 5) Leak check → refuse with a safe template.
  if (leaks(body, ctx)) {
    violations.push('leak');
    body = refusalBody();
    decision = 'refuse';
    actions = ensureAction(actions, 'escalate_to_human', 'Potential data leak blocked.');
  }

  // 6) Forbidden promise (flag only; body is left to the repair/escalation path).
  if (PROMISE_RE.test(String(body || ''))) violations.push('forbidden_promise');

  // 7) An "answer" with no citation is unsupported → escalate.
  if (decision === 'answer' && citations.length === 0) {
    violations.push('unsupported');
    decision = 'escalate';
    actions = ensureAction(actions, 'escalate_to_human', 'No supporting policy citation.');
  }

  return { decision, body, citations, actions, violations };
}
