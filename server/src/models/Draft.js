import mongoose from 'mongoose';

const { Schema } = mongoose;

const recommendedActionSchema = new Schema(
  { tool_name: String, reason: String },
  { _id: false },
);

const draftSchema = new Schema(
  {
    draft_id: { type: String, required: true, unique: true },
    ticket_id: { type: String, required: true, index: true },
    run_id: String,
    status: {
      type: String,
      enum: ['generated', 'edited', 'approved', 'rejected', 'sent'],
      default: 'generated',
    },
    body: String,
    citations: { type: [String], default: [] },
    recommended_actions: { type: [recommendedActionSchema], default: [] },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'drafts' },
);

export default mongoose.models.Draft || mongoose.model('Draft', draftSchema);
