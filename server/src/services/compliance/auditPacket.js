// Compliance audit packet (Phase 8.6). Bundles the full provenance of a tool
// action — ticket + conversation, triage, draft + citations, policy facts,
// approver decision, idempotency key and result — into one deterministic record,
// signed with a sha256 over its canonical form. The packet contains no
// export-time clock, so re-exporting the same (terminal) action is byte-stable.
import { fail } from '../../errors.js';
import { canonicalJson, sha256 } from '../hash.js';
import ToolAction from '../../models/ToolAction.js';
import Approval from '../../models/Approval.js';
import Ticket from '../../models/Ticket.js';
import Customer from '../../models/Customer.js';
import Order from '../../models/Order.js';
import Draft from '../../models/Draft.js';
import AgentRun from '../../models/AgentRun.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

export async function buildAuditPacket(actionId) {
  const action = await ToolAction.findOne({ action_id: actionId }).lean();
  if (!action) fail('NOT_FOUND', `Action ${actionId} not found`);

  const approval = await Approval.findOne({ action_id: actionId }).lean();
  const ticket = await Ticket.findOne({ ticket_id: action.ticket_id }).lean();
  const customer = ticket
    ? await Customer.findOne({ customer_id: ticket.customer_id }).lean()
    : null;
  const order = ticket?.order_id ? await Order.findOne({ order_id: ticket.order_id }).lean() : null;
  const draft = ticket
    ? await Draft.findOne({ ticket_id: ticket.ticket_id }).sort({ created_at: -1 }).lean()
    : null;
  const run = draft?.run_id ? await AgentRun.findOne({ run_id: draft.run_id }).lean() : null;
  const guard = run?.guardrail_results || {};

  // Explicitly selected provenance — stable field set, stable order.
  const content = {
    schema: 'trustdesk.audit_packet.v1',
    action: {
      action_id: action.action_id,
      tool_name: action.tool_name,
      status: action.status,
      risk_level: action.risk_level ?? null,
      idempotency_key: action.idempotency_key,
      payload_hash: action.payload_hash ?? null,
      payload: action.payload ?? {},
      result: action.result ?? null,
      requested_by: action.requested_by ?? null,
      created_at: iso(action.created_at),
      executed_at: iso(action.executed_at),
    },
    approval: approval
      ? {
          approval_id: approval.approval_id,
          reviewer_id: approval.reviewer_id ?? null,
          decision: approval.decision,
          reason: approval.reason ?? null,
          created_at: iso(approval.created_at),
        }
      : null,
    ticket: ticket
      ? {
          ticket_id: ticket.ticket_id,
          subject: ticket.subject ?? null,
          status: ticket.status ?? null,
          channel: ticket.channel ?? null,
          created_at: ticket.created_at ?? null,
          body: ticket.body ?? null,
          messages: (ticket.messages || []).map((m) => ({
            role: m.role,
            body: m.body,
            created_at: m.created_at ?? null,
            flagged: Boolean(m.flags?.any),
          })),
          triage: ticket.triage
            ? {
                category: ticket.triage.category ?? null,
                priority: ticket.triage.priority ?? null,
                sentiment: ticket.triage.sentiment ?? null,
                should_escalate: Boolean(ticket.triage.should_escalate),
                confidence: ticket.triage.confidence ?? null,
                overrides: ticket.triage.overrides || [],
              }
            : null,
        }
      : null,
    customer: customer
      ? {
          customer_id: customer.customer_id,
          name: customer.name ?? null,
          tier: customer.tier ?? null,
          verified: Boolean(customer.verified),
        }
      : null,
    order: order
      ? {
          order_id: order.order_id,
          status: order.status ?? null,
          total: order.total ?? null,
          currency: order.currency ?? null,
        }
      : null,
    draft: draft
      ? {
          draft_id: draft.draft_id,
          run_id: draft.run_id ?? null,
          status: draft.status ?? null,
          body: draft.body ?? null,
          citations: draft.citations || [],
          recommended_actions: draft.recommended_actions || [],
        }
      : null,
    policy: {
      decision: guard.decision ?? null,
      allowed_actions: guard.policy_allowed || [],
      denied_actions: guard.policy_denied || [],
      violations: guard.violations || [],
      flags: guard.flags || {},
      prompt_version: run?.prompt_version ?? null,
      retrieved_doc_ids: run?.retrieved_doc_ids || [],
      quarantined_doc_ids: run?.quarantined_doc_ids || [],
    },
  };

  const signature = { algorithm: 'sha256', value: sha256(canonicalJson(content)) };
  return { ...content, signature };
}
