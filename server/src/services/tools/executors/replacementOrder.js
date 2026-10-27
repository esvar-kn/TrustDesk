// create_replacement_order side effect. Keyed on the action's idempotency_key:
// the unique index on replacement_orders means a second (e.g. crash-retry)
// insert returns the existing row instead of creating a duplicate — the second
// idempotency guard behind the tool_actions one.
import { newId } from '../../ids.js';
import ReplacementOrder from '../../../models/ReplacementOrder.js';

export async function replacementOrder(action) {
  const { idempotency_key, order_id, sku } = action.payload;
  try {
    const doc = await ReplacementOrder.create({
      replacement_id: newId('rpl'),
      source_order_id: order_id,
      sku,
      idempotency_key,
    });
    return { replacement_id: doc.replacement_id, source_order_id: doc.source_order_id, sku: doc.sku };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const existing = await ReplacementOrder.findOne({ idempotency_key }).lean();
    return {
      replacement_id: existing.replacement_id,
      source_order_id: existing.source_order_id,
      sku: existing.sku,
    };
  }
}
