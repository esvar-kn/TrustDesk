import mongoose from 'mongoose';

const { Schema } = mongoose;

const evalRunSchema = new Schema(
  {
    eval_run_id: { type: String, required: true, unique: true },
    status: { type: String, default: 'queued' }, // queued | running | completed | failed
    provider: String,
    set: String, // which eval-case set was run: graded | holdout | all
    total_cases: Number,
    metrics: { type: Schema.Types.Mixed, default: {} },
    case_results: { type: [Schema.Types.Mixed], default: [] },
    started_at: Date,
    completed_at: Date,
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'eval_runs' },
);

export default mongoose.models.EvalRun || mongoose.model('EvalRun', evalRunSchema);
