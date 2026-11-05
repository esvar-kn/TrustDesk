// Parse ?limit= and ?offset= with sane clamps. List endpoints apply these so a
// growing collection can never be returned in one unbounded query. Responses
// keep their array shape (the client reads arrays); the full count is exposed
// via the X-Total-Count response header. Defaults are generous so current UIs
// that page through everything are unaffected.
export function getPagination(req, { defaultLimit = 200, maxLimit = 500 } = {}) {
  const rawLimit = parseInt(req.query.limit, 10);
  const rawOffset = parseInt(req.query.offset, 10);
  const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? defaultLimit : rawLimit, 1), maxLimit);
  const skip = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);
  return { limit, skip };
}
