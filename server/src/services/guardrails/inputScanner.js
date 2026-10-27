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

// Convenience: scan a ticket's customer text.
export function scanTicket(ticket, opts) {
  return scanInput(`${ticket?.subject || ''}\n${ticket?.body || ''}`, opts);
}
