// Tool-action tests: the approval-gated, idempotent, crash-safe path that is the
// only way a side effect lands. Covers request→approve→execute, idempotency
// replay, key reuse, no self-approval, and concurrent double-execute landing
// exactly one side effect. Real in-memory Mongo (unique indexes enforced).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/testDb.js';
import { seedTestDb } from './helpers/seedTestDb.js';
import { toolActionService } from '../src/services/tools/toolActionService.js';
import Ticket from '../src/models/Ticket.js';
import ToolAction from '../src/models/ToolAction.js';
import Approval from '../src/models/Approval.js';
import ReplacementOrder from '../src/models/ReplacementOrder.js';

const AGENT = { sub: 'agent' };
const AGENT2 = { sub: 'agent2' };
const MANAGER = { sub: 'manager' };

// A valid create_replacement_order for the in-window damaged ticket tkt_9001.
const replacementPayload = (key = 'k-9001-1') => ({
  idempotency_key: key,
  order_id: 'ord_5001',
  sku: 'BG-AIRPODS-01',
  reason: 'Damaged on arrival',
});

async function triageRefund(ticketId) {
  await Ticket.updateOne(
    { ticket_id: ticketId },
    { $set: { triage: { category: 'refund', priority: 'medium', should_escalate: false } } },
  );
}

beforeAll(async () => {
  await startTestDb();
}, 120000);
afterAll(stopTestDb);

beforeEach(async () => {
  await seedTestDb();
  await triageRefund('tkt_9001');
});

describe('request()', () => {
  it('creates an approval_required action for a human-approval tool', async () => {
    const { action, replay } = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload() },
      AGENT,
    );
    expect(replay).toBe(false);
    expect(action.status).toBe('approval_required');
    expect(action.requested_by).toBe('agent');
  });

  it('rejects a tool the policy does not allow for the ticket', async () => {
    await expect(
      toolActionService.request(
        { ticketId: 'tkt_9001', toolName: 'issue_coupon', payload: { idempotency_key: 'c1', customer_id: 'cus_1001', amount: 100, reason: 'x' } },
        AGENT,
      ),
    ).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
  });

  it('rejects a payload whose order_id does not match the ticket', async () => {
    await expect(
      toolActionService.request(
        { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: { ...replacementPayload(), order_id: 'ord_9999' } },
        AGENT,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires triage before a request', async () => {
    await Ticket.updateOne({ ticket_id: 'tkt_9001' }, { $unset: { triage: '' } });
    await expect(
      toolActionService.request(
        { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload() },
        AGENT,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('idempotency', () => {
  it('replays the same action for a repeated key + identical payload', async () => {
    const first = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload('dup') },
      AGENT,
    );
    const second = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload('dup') },
      AGENT,
    );
    expect(second.replay).toBe(true);
    expect(second.action.action_id).toBe(first.action.action_id);
    expect(await ToolAction.countDocuments({ idempotency_key: 'dup' })).toBe(1);
  });

  it('rejects a reused key with a different payload', async () => {
    await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload('reuse') },
      AGENT,
    );
    await expect(
      toolActionService.request(
        { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: { ...replacementPayload('reuse'), reason: 'different reason' } },
        AGENT,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});

describe('approve()', () => {
  it('blocks the requester from approving their own action (no self-approval)', async () => {
    const { action } = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload('self') },
      AGENT,
    );
    await expect(
      toolActionService.approve(action.action_id, { decision: 'approved' }, AGENT),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const fresh = await ToolAction.findOne({ action_id: action.action_id }).lean();
    expect(fresh.status).toBe('approval_required');
  });

  it('lets a different reviewer approve, and records one Approval', async () => {
    const { action } = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload('ok') },
      AGENT,
    );
    const approved = await toolActionService.approve(action.action_id, { decision: 'approved', reason: 'looks good' }, MANAGER);
    expect(approved.status).toBe('approved');
    expect(await Approval.countDocuments({ action_id: action.action_id })).toBe(1);
  });

  it('rejects a second decision on an already-decided action', async () => {
    const { action } = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload('twice') },
      AGENT,
    );
    await toolActionService.approve(action.action_id, { decision: 'approved' }, MANAGER);
    await expect(
      toolActionService.approve(action.action_id, { decision: 'rejected' }, AGENT2),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('execute()', () => {
  async function approvedAction(key) {
    const { action } = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload(key) },
      AGENT,
    );
    await toolActionService.approve(action.action_id, { decision: 'approved' }, MANAGER);
    return action.action_id;
  }

  it('executes an approved action and stores the replacement result', async () => {
    const id = await approvedAction('exec');
    const done = await toolActionService.execute(id);
    expect(done.status).toBe('executed');
    expect(done.result.replacement_id).toMatch(/^rpl_/);
    expect(await ReplacementOrder.countDocuments({})).toBe(1);
  });

  it('refuses to execute an action still awaiting approval', async () => {
    const { action } = await toolActionService.request(
      { ticketId: 'tkt_9001', toolName: 'create_replacement_order', payload: replacementPayload('unappr') },
      AGENT,
    );
    await expect(toolActionService.execute(action.action_id)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });

  it('replays the stored result on a second execute (no duplicate side effect)', async () => {
    const id = await approvedAction('replay');
    const a = await toolActionService.execute(id);
    const b = await toolActionService.execute(id);
    expect(b.result.replacement_id).toBe(a.result.replacement_id);
    expect(await ReplacementOrder.countDocuments({})).toBe(1);
  });

  it('lands exactly one side effect under concurrent double execute', async () => {
    const id = await approvedAction('concurrent');
    const results = await Promise.allSettled([
      toolActionService.execute(id),
      toolActionService.execute(id),
    ]);
    // At least one succeeds; neither creates a duplicate replacement order.
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(await ReplacementOrder.countDocuments({})).toBe(1);
    const fresh = await ToolAction.findOne({ action_id: id }).lean();
    expect(fresh.status).toBe('executed');
  });
});
