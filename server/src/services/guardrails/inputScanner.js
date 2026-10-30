// Scans CUSTOMER-SUPPLIED text only (subject + body) and produces guardrail
// flags. It never reads knowledge-base documents — KB-SECURITY-001 legitimately
// quotes injection phrases, so scanning docs would mis-flag a trusted doc.
import { detectFlags, extractInrAmounts } from './patterns.js';

const DEFAULT_COUPON_CAP = 1000;

// scanInput(text, { couponCap }) -> { override, exfiltration, concealment,
//   identity_bypass, coupon_over_cap, any }
export function scanInput(text, { couponCap = DEFAULT_COUPON_CAP } = {}) {
  const flags = detectFlags(text);
  flags.coupon_over_cap = extractInrAmounts(text).some((n) => n > couponCap);
  flags.any =
    flags.override ||
    flags.exfiltration ||
    flags.concealment ||
    flags.identity_bypass ||
    flags.coupon_over_cap;
  return flags;
}

// Convenience: scan a ticket's customer text. For a conversation (Phase 8.1) this
// scans every customer turn, so an injection planted in any follow-up is caught;
// a legacy single-message ticket falls back to subject + body (unchanged).
export function scanTicket(ticket, opts) {
  const subject = ticket?.subject || '';
  const msgs = Array.isArray(ticket?.messages) ? ticket.messages : [];
  const customerTurns = msgs.filter((m) => m?.role === 'customer').map((m) => m.body);
  const text = customerTurns.length
    ? `${subject}\n${customerTurns.join('\n')}`
    : `${subject}\n${ticket?.body || ''}`;
  return scanInput(text, opts);
}
