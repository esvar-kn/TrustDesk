// Policy engine regression test — asserts the §3.1 facts for all 8 tickets,
// with the system clock forced to 2031 to prove the engine never reads it.
// No DB: the policy engine is pure.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readJson, indexBy } from './helpers/data.js';
import { evaluate } from '../src/services/policy/policyEngine.js';

const customers = indexBy(readJson('customers.json'), 'customer_id');
const orders = indexBy(readJson('orders.json'), 'order_id');
const tickets = indexBy(readJson('tickets.json'), 'ticket_id');

// Orders per customer (for the duplicate-charge rule).
const orderCount = {};
for (const o of readJson('orders.json')) orderCount[o.customer_id] = (orderCount[o.customer_id] || 0) + 1;

// Flags the input scanner (Phase 3.3) will produce for the adversarial tickets.
const FLAGS = {
  tkt_9005: { identity_bypass: true },
  tkt_9006: { override: true, concealment: true, coupon_over_cap: true },
  tkt_9007: { exfiltration: true },
};

function policyFor(id) {
  const ticket = tickets[id];
  return evaluate({
    ticket,
    customer: customers[ticket.customer_id],
    order: orders[ticket.order_id] || null,
    flags: FLAGS[id] || {},
    orderCount: orderCount[ticket.customer_id],
  });
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('policy engine §3.1 (clock = 2031)', () => {
  it('tkt_9001 — damaged, in window: allow replacement + refund review', () => {
    const p = policyFor('tkt_9001');
    expect(p.floor).toBe('medium');
    expect(p.allowed).toEqual(expect.arrayContaining(['create_replacement_order', 'start_refund_review']));
    expect(p.denied).toEqual([]);
    expect(p.escalate).toEqual([]);
    expect(p.requiredDocs).toContain('KB-REFUND-001');
    expect(p.categoryHint).toBeNull();
  });

  it('tkt_9002 — in transit: allow carrier investigation, deny replacement/refund', () => {
    const p = policyFor('tkt_9002');
    expect(p.floor).toBe('high');
    expect(p.allowed).toContain('open_carrier_investigation');
    expect(p.denied).toEqual(expect.arrayContaining(['create_replacement_order', 'start_refund_review']));
    expect(p.requiredDocs).toContain('KB-SHIPPING-001');
    expect(p.escalate).toEqual([]);
  });

  it('tkt_9003 — final sale: deny refund/replacement/coupon, no escalation', () => {
    const p = policyFor('tkt_9003');
    expect(p.floor).toBe('low');
    expect(p.denied).toEqual(
      expect.arrayContaining(['start_refund_review', 'create_replacement_order', 'issue_coupon']),
    );
    expect(p.escalate).toEqual([]);
    expect(p.requiredDocs).toContain('KB-REFUND-001');
  });

  it('tkt_9004 — safety (swelling): escalate urgent, deny replacement + coupon', () => {
    const p = policyFor('tkt_9004');
    expect(p.floor).toBe('urgent');
    expect(p.escalate).toContain('safety');
    expect(p.denied).toEqual(expect.arrayContaining(['create_replacement_order', 'issue_coupon']));
    expect(p.requiredDocs).toContain('KB-WARRANTY-001');
  });

  it('tkt_9005 — account change, unverified: escalate identity, deny lock_account + coupon', () => {
    const p = policyFor('tkt_9005');
    expect(p.floor).toBe('high');
    expect(p.escalate).toContain('identity');
    expect(p.categoryHint).toBe('account_security');
    expect(p.denied).toEqual(expect.arrayContaining(['lock_account', 'issue_coupon']));
    expect(p.requiredDocs).toContain('KB-ACCOUNT-001');
  });

  it('tkt_9006 — override/coupon injection: escalate, deny all sensitive, cite security', () => {
    const p = policyFor('tkt_9006');
    expect(p.escalate).toContain('unsafe_instruction');
    expect(p.denied).toEqual(
      expect.arrayContaining(['create_replacement_order', 'start_refund_review', 'issue_coupon', 'lock_account']),
    );
    expect(p.requiredDocs).toContain('KB-SECURITY-001');
  });

  it('tkt_9007 — exfiltration: escalate high, account_security, deny all sensitive', () => {
    const p = policyFor('tkt_9007');
    expect(p.floor).toBe('high');
    expect(p.escalate).toContain('unsafe_instruction');
    expect(p.categoryHint).toBe('account_security');
    expect(p.denied).toEqual(
      expect.arrayContaining(['create_replacement_order', 'start_refund_review', 'issue_coupon', 'lock_account']),
    );
    expect(p.requiredDocs).toContain('KB-SECURITY-001');
  });

  it('tkt_9008 — duplicate charge, single order: allow refund review', () => {
    const p = policyFor('tkt_9008');
    expect(p.floor).toBe('high');
    expect(p.allowed).toContain('start_refund_review');
    expect(p.requiredDocs).toContain('KB-BILLING-001');
  });

  it('escalate_to_human is always allowed', () => {
    for (const id of Object.keys(tickets)) {
      expect(policyFor(id).allowed).toContain('escalate_to_human');
    }
  });
});
