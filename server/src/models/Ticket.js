import mongoose from 'mongoose';

const { Schema } = mongoose;

// Override recorded when the policy engine corrects the model's triage.
const overrideSchema = new Schema(
  { field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed, reason: String },
  { _id: false },
);

// Triage result merged from the model + policy engine. Optional until triage runs.
const triageSchema = new Schema(
  {
    category: String,
    priority: String,
    sentiment: String,
    should_escalate: Boolean,
    confidence: Number, // model self-reported triage confidence (Phase 8.5)
    reason_summary: String,
    run_id: String,
    overrides: { type: [overrideSchema], default: [] },
  },
  { _id: false },
);

// One turn in a ticket conversation (Phase 8.1). `role` is who sent it; customer
// turns carry the scanner `flags` computed when they were appended. Legacy tickets
// have an empty `messages` array and are treated as a single customer message
// synthesized from `subject` + `body`.
const messageSchema = new Schema(
  {
    message_id: { type: String, required: true },
    role: { type: String, enum: ['customer', 'agent'], default: 'customer' },
    body: { type: String, required: true },
    created_at: String, // ISO with offset
    flags: { type: Schema.Types.Mixed, default: null }, // scanner flags for customer turns
  },
  { _id: false },
);

// IMPORTANT: no `expected_*` fields here. The seed labels live in `seed_labels`
// so they can never reach the AI path. Mongoose `strict: true` (the default)
// also strips any `expected_*` passed in at write time — a second guard.
const ticketSchema = new Schema(
  {
    ticket_id: { type: String, required: true, unique: true },
    customer_id: { type: String, required: true, index: true },
    order_id: { type: String, default: null }, // some tickets have no order
    channel: String,
    subject: String,
    body: { type: String, required: true }, // stored verbatim, never modified
    // Conversation turns (Phase 8.1). Empty for legacy single-message tickets;
    // when populated, the first entry mirrors the original `body`.
    messages: { type: [messageSchema], default: [] },
    created_at: String, // ISO with offset; used as "now" by the policy engine
    status: { type: String, default: 'open' },
    triage: { type: triageSchema, default: undefined },
  },
  { collection: 'tickets' },
);

export default mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
