import mongoose from 'mongoose';

const { Schema } = mongoose;

// idempotency_key is unique: duplicate requests replay the same action rather
// than creating a second one. `executing_since` backs the 60s executing lease.
const toolActionSchema = new Schema(
  {
    action_id: { type: String, required: true, unique: true },
    ticket_id: { type: String, required: true, index: true },
    tool_name: String,
    payload: { type: Schema.Types.Mixed, default: {} },
    payload_hash: String,
    risk_level: String,
    requires_human_approval: { type: Boolean, default: true },
    status: {
      type: String,
      enum: [
        'requested',
        'approval_required',
        'approved',
        'rejected',
        'executing',
        'executed',
        'failed',
        'cancelled',
      ],
      default: 'requested',
    },
    idempotency_key: { type: String, required: true, unique: true },
    result: { type: Schema.Types.Mixed, default: null },
    requested_by: String,
    executing_since: Date,
    executed_at: Date,
    error: String,
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'tool_actions' },
);

export default mongoose.models.ToolAction || mongoose.model('ToolAction', toolActionSchema);
