// Builds the retrieval query for a ticket.
//
// The pack's keyword baseline cheated by including each eval case's `input`
// field (evaluator-written text the app never has). We build the query only
// from data the app actually holds: the ticket text plus terms derived from the
// linked order and customer tier. These order-derived terms are what lift the
// weak eval_001 / eval_003 rankings into the top 3.
//
// SECURITY: customer-authored text (subject, body) is used ONLY as search
// tokens here — never as instructions. It feeds a $text query, not a prompt.

const FINAL_SALE_CATEGORIES = ['software', 'gift_card'];

export function buildQuery({ ticket, customer, order } = {}) {
  const parts = [];

  // Customer text — search tokens only. For a conversation (Phase 8.1) use every
  // customer turn so retrieval follows the latest question; legacy tickets use body.
  if (ticket?.subject) parts.push(ticket.subject);
  const turns =
    Array.isArray(ticket?.messages) && ticket.messages.length
      ? ticket.messages.filter((m) => m?.role === 'customer').map((m) => m.body)
      : ticket?.body
        ? [ticket.body]
        : [];
  for (const t of turns) if (t) parts.push(t);

  if (order) {
    const items = order.items || [];

    // Item category terms (e.g. "audio", "software").
    const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];
    if (categories.length) parts.push(categories.join(' '));

    // Final-sale / non-returnable signal.
    const finalSale = items.some(
      (i) => i.final_sale || FINAL_SALE_CATEGORIES.includes(i.category),
    );
    if (finalSale) parts.push('final sale software license non-returnable');

    // In-transit shipping signal.
    if (order.status === 'in_transit') parts.push('tracking delivery carrier');
  }

  // Tier signal (goodwill / extended warranty consideration).
  if (customer?.tier === 'gold') parts.push('gold');

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export const queryBuilder = { buildQuery };
