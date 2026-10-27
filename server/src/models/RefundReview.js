import mongoose from 'mongoose';

const { Schema } = mongoose;

// Side-effect record for start_refund_review. Like replacement_orders, the
// unique idempotency_key means a retry inserts once and returns the existing
// row — no money moves, this only opens a review for a human.
const refundReviewSchema = new Schema(
  {
    refund_review_id: { type: String, required: true, unique: true },
    source_order_id: String,
    amount: Number,
    status: { type: String, default: 'pending' },
    idempotency_key: { type: String, required: true, unique: true },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'refund_reviews' },
);

export default mongoose.models.RefundReview || mongoose.model('RefundReview', refundReviewSchema);
