// Executor registry: tool_name -> side-effect function.
import { replacementOrder } from './replacementOrder.js';
import { refundReview } from './refundReview.js';

export const executors = {
  create_replacement_order: replacementOrder,
  start_refund_review: refundReview,
};
