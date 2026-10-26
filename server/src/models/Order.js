import mongoose from 'mongoose';

const { Schema } = mongoose;

const orderItemSchema = new Schema(
  {
    sku: String,
    name: String,
    quantity: Number,
    category: String, // e.g. audio | software | gift_card
    final_sale: { type: Boolean, default: false },
  },
  { _id: false },
);

// Date fields stay as ISO strings so the policy engine parses offsets/end-of-day
// deterministically (never via the wall clock).
const orderSchema = new Schema(
  {
    order_id: { type: String, required: true, unique: true },
    customer_id: { type: String, required: true, index: true },
    status: String, // delivered | in_transit | ...
    placed_at: String,
    delivered_at: String,
    eligible_return_until: String,
    total: Number,
    currency: String,
    payment_status: String,
    tracking_number: String,
    items: { type: [orderItemSchema], default: [] },
  },
  { collection: 'orders' },
);

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
