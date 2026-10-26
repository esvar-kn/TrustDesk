// The policy engine: turns a ticket + customer + order (+ scanner flags) into
// deterministic facts — which tools are allowed/denied, the priority floor,
// escalation reasons, which docs MUST be cited, and a category hint.
//
// "Now" is always the ticket's created_at — never the wall clock — so results
// are reproducible forever (the tests run with the clock set to 2031).
//
// Design split:
//   • ticket-text heuristics (damage, safety, duplicate charge, account change,
//     urgent travel, refund ask) are computed here;
//   • prompt-injection style flags (override/exfiltration/concealment/
//     coupon_over_cap) and identity_bypass come from the input scanner (2.5 is
//     independent of it) and are passed in via `flags`.
import { parseISO, endOfDay, addMonths, addBusinessDays, businessDaysBetween } from './dates.js';

export const PRIORITY_LEVELS = ['low', 'medium', 'high', 'urgent'];
export const SENSITIVE_TOOLS = [
  'create_replacement_order',
  'start_refund_review',
  'issue_coupon',
  'lock_account',
];
const FINAL_SALE_CATEGORIES = ['software', 'gift_card'];

// --- ticket-text detectors (deterministic keyword matches) ---
const text = (t) => `${t?.subject || ''} ${t?.body || ''}`.toLowerCase();
const mentionsDamage = (t) => /damag|crack|broke|broken|defect|faulty|not working|arrived.*(cracked|broken)/i.test(text(t));
const mentionsSafety = (t) => /swell|overheat|burning smell|smoke|exposed wire|electric shock|caught fire|sparks?/i.test(text(t));
const mentionsDuplicateCharge = (t) => /double charge|duplicate charge|charged twice|two charges|charged me twice/i.test(text(t));
const requestsAccountChange = (t) => /change (my )?(account )?email|update (my )?email|reset (my )?password|change (my )?password|lock (my )?account/i.test(text(t));
const mentionsUrgentTravel = (t) => /travel|trip|flight|vacation|holiday/i.test(text(t));
const asksRefund = (t) => /refund|return|replace|replacement|money back/i.test(text(t));

function selectItem(order, ticket) {
  const items = order.items || [];
  if (items.length <= 1) return items[0];
  const hay = text(ticket);
  return (
    items.find(
      (i) =>
        (i.name && hay.includes(i.name.toLowerCase())) ||
        (i.sku && hay.includes(i.sku.toLowerCase())),
    ) || items[0]
  );
}

// evaluate({ ticket, customer, order, flags, orderCount }) -> facts
export function evaluate({ ticket, customer = {}, order = null, flags = {}, orderCount } = {}) {
  const asOf = parseISO(ticket.created_at);

  const allowed = new Set(['escalate_to_human']);
  const denied = new Set();
  const escalate = [];
  const requiredDocs = new Set();
  const facts = {};
  let floor = 'low';
  let categoryHint = null;

  const raise = (p) => {
    if (PRIORITY_LEVELS.indexOf(p) > PRIORITY_LEVELS.indexOf(floor)) floor = p;
  };
  const allow = (...ts) => ts.forEach((t) => allowed.add(t));
  const deny = (...ts) => ts.forEach((t) => denied.add(t));
  const denyAllSensitive = () => deny(...SENSITIVE_TOOLS);

  const unsafeInstruction = Boolean(
    flags.override || flags.exfiltration || flags.concealment || flags.coupon_over_cap,
  );

  // --- delivered-order facts ---
  if (order?.delivered_at) {
    facts.withinReturnWindow = asOf <= endOfDay(order.eligible_return_until);
    const item = selectItem(order, ticket);
    facts.finalSale = Boolean(item?.final_sale) || FINAL_SALE_CATEGORIES.includes(item?.category);

    if (facts.finalSale) deny('start_refund_review', 'create_replacement_order', 'issue_coupon');
    if (facts.withinReturnWindow && !facts.finalSale && mentionsDamage(ticket)) {
      allow('create_replacement_order', 'start_refund_review');
      raise('medium');
    }
    if (facts.finalSale || asksRefund(ticket)) requiredDocs.add('KB-REFUND-001');

    const warrantyEnd = addMonths(parseISO(order.delivered_at), 12 + (customer.tier === 'gold' ? 6 : 0));
    facts.underWarranty = asOf <= endOfDay(warrantyEnd);
    facts.warrantyEnd = warrantyEnd.toISOString();
  }

  // --- in-transit shipping facts ---
  if (order?.status === 'in_transit') {
    const dispatch = addBusinessDays(order.placed_at, 1); // 1 business day to dispatch
    const stale = businessDaysBetween(dispatch, asOf);
    facts.staleBusinessDays = stale;
    if (stale >= 5) allow('open_carrier_investigation');
    if (stale < 10) deny('create_replacement_order', 'start_refund_review');
    requiredDocs.add('KB-SHIPPING-001');
  }

  // --- safety (always escalates) ---
  if (mentionsSafety(ticket)) {
    escalate.push('safety');
    raise('urgent');
    deny('create_replacement_order', 'issue_coupon');
    requiredDocs.add('KB-WARRANTY-001');
  }

  // --- duplicate charge (single order) ---
  if (mentionsDuplicateCharge(ticket) && orderCount === 1) {
    allow('start_refund_review');
    raise('high');
    requiredDocs.add('KB-BILLING-001');
  }

  // --- account change by an unverified/ bypassing customer ---
  if (requestsAccountChange(ticket) && (!customer.verified || flags.identity_bypass)) {
    escalate.push('identity');
    raise('high');
    categoryHint = 'account_security';
    deny('lock_account', 'issue_coupon');
    requiredDocs.add('KB-ACCOUNT-001');
  }

  // --- prompt-injection / unsafe instruction flags ---
  if (unsafeInstruction) {
    escalate.push('unsafe_instruction');
    denyAllSensitive();
    requiredDocs.add('KB-SECURITY-001');
    if (flags.exfiltration) {
      raise('high');
      categoryHint = 'account_security';
    }
  }

  if (mentionsUrgentTravel(ticket)) raise('high');

  // A denial always beats an allowance.
  for (const t of denied) allowed.delete(t);

  return {
    allowed: [...allowed].sort(),
    denied: [...denied].sort(),
    escalate,
    floor,
    requiredDocs: [...requiredDocs].sort(),
    categoryHint,
    facts,
  };
}

// Merge the model's triage with policy facts. Priority = max(model, floor);
// escalate = model OR any policy reason (policy can add, never remove); category
// = policy hint when set. Every change is recorded as an override for the trace.
export function mergeTriage(model, policy) {
  const idx = (p) => Math.max(PRIORITY_LEVELS.indexOf(p), 0);
  const priority = PRIORITY_LEVELS[Math.max(idx(model.priority), idx(policy.floor))];
  const should_escalate = Boolean(model.should_escalate) || policy.escalate.length > 0;
  const category = policy.categoryHint || model.category;

  const overrides = [];
  if (priority !== model.priority)
    overrides.push({ field: 'priority', from: model.priority, to: priority, reason: 'policy_floor' });
  if (should_escalate !== Boolean(model.should_escalate))
    overrides.push({
      field: 'should_escalate',
      from: Boolean(model.should_escalate),
      to: should_escalate,
      reason: policy.escalate.join(',') || 'policy',
    });
  if (category !== model.category)
    overrides.push({ field: 'category', from: model.category, to: category, reason: 'policy_category_hint' });

  return { category, priority, should_escalate, overrides };
}

export const policyEngine = { evaluate, mergeTriage, PRIORITY_LEVELS, SENSITIVE_TOOLS };
