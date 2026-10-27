// Triage prompt (v1): classify category, priority, sentiment, escalation.
import { safetyPreamble, tag, escapeData, factsForPrompt } from './shared.js';

export const VERSION = 'triage.v1';

const PRIORITY_RUBRIC = [
  'Priority rubric:',
  '- urgent: safety hazards (battery swelling, overheating, smoke, fire, electric shock).',
  '- high: account-security/identity issues, secret-exfiltration or override attempts, duplicate charges and billing disputes, or a stuck shipment with urgent travel.',
  '- medium: standard refund/replacement/warranty requests within policy.',
  '- low: general questions, minor requests, or change-of-mind on final-sale items.',
  'Never set a priority below facts.priority_floor. If any escalation_reasons are present, should_escalate must be true.',
].join('\n');

const CATEGORIES = 'Categories: shipping, refund, warranty, billing, account_security, general.';
const SENTIMENTS = 'Sentiments: positive, neutral, frustrated, worried, angry.';

export function buildTriagePrompt({ ticket, policy = {}, flags = {} } = {}) {
  const system = [
    safetyPreamble(),
    '',
    'TASK: Triage this support ticket.',
    CATEGORIES,
    SENTIMENTS,
    PRIORITY_RUBRIC,
    '',
    'Output JSON: { "category", "priority", "sentiment", "should_escalate": boolean, "reason_summary": string }.',
  ].join('\n');

  const user = [
    tag('facts', JSON.stringify(factsForPrompt(policy))),
    tag('customer_message', escapeData(`${ticket.subject || ''}\n${ticket.body || ''}`.trim())),
    tag('scanner_flags', JSON.stringify(flags)),
  ].join('\n\n');

  return { system, messages: [{ role: 'user', content: user }] };
}
