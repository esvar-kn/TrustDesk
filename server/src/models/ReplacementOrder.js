import mongoose from 'mongoose';

const { Schema } = mongoose;

// Second idempotency guard on the actual side effect: a unique idempotency_key
// means a double execute inserts once and returns the existing record.
const replacementOrderSchema = new Schema(
  {
    replacement_id: { type: String, required: true, unique: true },
    source_order_id: String,
    sku: String,
    idempotency_key: { type: String, required: true, unique: true },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'replacement_orders' },
);

export default mongoose.models.ReplacementOrder ||
  mongoose.model('ReplacementOrder', replacementOrderSchema);
