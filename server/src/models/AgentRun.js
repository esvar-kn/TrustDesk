import mongoose from 'mongoose';

const { Schema } = mongoose;

// One trace per triage/draft/tool/eval run — written whether it succeeds,
// escalates or fails, so run history is auditable.
const agentRunSchema = new Schema(
  {
    run_id: { type: String, required: true, unique: true },
    ticket_id: String,
    run_type: {
      type: String,
      enum: ['triage', 'draft_reply', 'tool_recommendation', 'eval_case'],
    },
    status: String, // succeeded | escalated | failed | ...
    retrieved_doc_ids: { type: [String], default: [] },
    quarantined_doc_ids: { type: [String], default: [] },
    tool_calls: { type: [Schema.Types.Mixed], default: [] },
    guardrail_results: { type: Schema.Types.Mixed, default: {} },
    model_provider: String,
    model_name: String,
    prompt_version: String,
    latency_ms: Number,
    token_usage: { type: Schema.Types.Mixed, default: null },
    eval_run_id: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'agent_runs' },
);

agentRunSchema.index({ ticket_id: 1, created_at: -1 });

export default mongoose.models.AgentRun || mongoose.model('AgentRun', agentRunSchema);
