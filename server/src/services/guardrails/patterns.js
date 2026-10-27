// Guardrail pattern matching for customer-supplied text.
//
// Text is normalised (NFKC, lowercased, whitespace collapsed) and also tested in
// a "compact" form with all spaces removed, which catches letter-spaced evasion
// like "i g n o r e".  Patterns favour recall; the real backstops are the policy
// allowlist and human approval, not this scanner.

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function compact(s) {
  return normalize(s).replace(/\s+/g, '');
}

// Each detector is tested against the compact (space-free) form.
const COMPACT_PATTERNS = {
  override: [
    /(ignore|disregard|forget).{0,20}(instruction|polic|rule)/,
    /systemoverride/,
    /youarenowallowed/,
    /newinstructions?:/,
  ],
  exfiltration: [
    /(system|hidden|internal)prompt/,
    /api[_-]?key/,
    /internalnote/,
    /printyour/,
    /reveal.{0,15}(prompt|instruction|secret|key)/,
  ],
  concealment: [
    /donot(mention|tell|reveal).{0,40}(human|reviewer|supervisor|manager)/,
    /(human|reviewer|supervisor|manager).{0,40}donot(mention|tell|reveal)/,
  ],
  identity_bypass: [
    /(ignore|skip|bypass|without).{0,20}(identity|verification|verify|authentication)/,
    /(identity|verification|verify|authentication).{0,20}(ignore|skip|bypass|without)/,
  ],
};

export function detectFlags(text) {
  const c = compact(text);
  const flags = {};
  for (const [name, patterns] of Object.entries(COMPACT_PATTERNS)) {
    flags[name] = patterns.some((re) => re.test(c));
  }
  return flags;
}

// Extract INR amounts near a currency token, or any 3+ digit number when a
// coupon is being requested. Used to detect coupon_over_cap.
export function extractInrAmounts(text) {
  const t = normalize(text);
  const nums = [];
  const push = (s) => {
    const n = parseInt(String(s).replace(/,/g, ''), 10);
    if (!Number.isNaN(n)) nums.push(n);
  };
  for (const m of t.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+)/g)) push(m[1]);
  for (const m of t.matchAll(/([\d,]+)\s*(?:₹|rs\.?|inr|rupees?)/g)) push(m[1]);
  if (/coupon/.test(t)) for (const m of t.matchAll(/\b(\d{3,})\b/g)) push(m[1]);
  return nums;
}
