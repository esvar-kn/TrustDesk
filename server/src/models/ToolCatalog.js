import mongoose from 'mongoose';

const { Schema } = mongoose;

// Seeded reference data from data/tool_actions.json — the enforceable tool
// registry (required fields, allowed categories, risk, approval, amount cap).
const toolCatalogSchema = new Schema(
  {
    tool_name: { type: String, required: true, unique: true },
    description: String,
    risk_level: String,
    requires_human_approval: { type: Boolean, default: true },
    allowed_categories: { type: [String], default: [] },
    required_fields: { type: [String], default: [] },
    max_amount_inr: { type: Number, default: null },
  },
  { collection: 'tool_catalog' },
);

export default mongoose.models.ToolCatalog || mongoose.model('ToolCatalog', toolCatalogSchema);
