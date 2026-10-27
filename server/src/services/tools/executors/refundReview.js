// start_refund_review side effect. Opens a (human-reviewed) refund review,
// keyed on idempotency_key — same idempotent engine as replacementOrder.
import { newId } from '../../ids.js';
import RefundReview from '../../../models/RefundReview.js';

export async function refundReview(action) {
  const { idempotency_key, order_id, amount } = action.payload;
  try {
    const doc = await RefundReview.create({
      refund_review_id: newId('rfr'),
      source_order_id: order_id,
      amount,
      status: 'pending',
      idempotency_key,
    });
    return {
      refund_review_id: doc.refund_review_id,
      source_order_id: doc.source_order_id,
      amount: doc.amount,
      status: doc.status,
    };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const existing = await RefundReview.findOne({ idempotency_key }).lean();
    return {
      refund_review_id: existing.refund_review_id,
      source_order_id: existing.source_order_id,
      amount: existing.amount,
      status: existing.status,
    };
  }
}
