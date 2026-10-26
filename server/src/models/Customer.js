import mongoose from 'mongoose';

const { Schema } = mongoose;

// Seed date fields are kept as ISO strings to preserve the exact seed values.
const customerSchema = new Schema(
  {
    customer_id: { type: String, required: true, unique: true },
    name: String,
    email: String,
    tier: String, // e.g. gold | silver | standard
    country: String,
    created_at: String,
    verified: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
  },
  { collection: 'customers' },
);

export default mongoose.models.Customer || mongoose.model('Customer', customerSchema);
