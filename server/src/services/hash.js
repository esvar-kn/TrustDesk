import crypto from 'node:crypto';

// Deterministic JSON: object keys sorted recursively, so the same logical
// payload always hashes to the same string regardless of key order.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(v[k]);
        return acc;
      }, {});
  }
  return v;
}

export function canonicalJson(obj) {
  return JSON.stringify(sortKeys(obj));
}

export function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Hash of the payload excluding idempotency_key: two requests with the same key
// but different content hash differently, which is how key reuse is detected.
export function payloadHash(payload = {}) {
  const { idempotency_key: _ignored, ...rest } = payload;
  return sha256(canonicalJson(rest));
}
