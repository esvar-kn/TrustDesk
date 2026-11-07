import mongoose from 'mongoose';

const { Schema } = mongoose;

// Seeded reference data from data/eval_cases.jsonl. `input` is evaluator-written
// text; `expected` holds category/priority/must_cite_doc_ids/allowed+disallowed
// actions/should_escalate/answer_requirements. Read only by the eval runner.
const evalCaseSchema = new Schema(
  {
    case_id: { type: String, required: true, unique: true },
    ticket_id: { type: String, index: true },
    input: String,
    expected: { type: Schema.Types.Mixed, default: {} },
    // 'graded' = the gated cases; 'holdout' = extra cases scored and reported
    // apart from the graded set and excluded from the --fail-under gate.
    set: { type: String, enum: ['graded', 'holdout'], default: 'graded', index: true },
  },
  { collection: 'eval_cases' },
);

export default mongoose.models.EvalCase || mongoose.model('EvalCase', evalCaseSchema);
