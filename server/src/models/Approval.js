import mongoose from 'mongoose';

const { Schema } = mongoose;

// action_id is unique: exactly one decision per action.
const approvalSchema = new Schema(
  {
    approval_id: { type: String, required: true, unique: true },
    action_id: { type: String, required: true, unique: true },
    reviewer_id: String,
    decision: { type: String, enum: ['approved', 'rejected', 'needs_changes'] },
    reason: String,
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'approvals' },
);

export default mongoose.models.Approval || mongoose.model('Approval', approvalSchema);
