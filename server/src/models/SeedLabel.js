import mongoose from 'mongoose';

const { Schema } = mongoose;

// The ticket answer key, split out of tickets at seed time. Read ONLY by the eval
// runner — an ESLint no-restricted-imports rule bars AI services from this model.
const seedLabelSchema = new Schema(
  {
    ticket_id: { type: String, required: true, unique: true },
    expected_category: String,
    expected_priority: String,
    expected_sentiment: String,
    expected_escalation: Boolean,
    expected_actions: { type: [String], default: [] },
  },
  { collection: 'seed_labels' },
);

export default mongoose.models.SeedLabel || mongoose.model('SeedLabel', seedLabelSchema);
