import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors.js';
import User from '../models/User.js';

// Verifies a Bearer JWT, then re-checks the account against the DB so the token
// claim is not trusted on its own: a deleted account is rejected and the role is
// re-read live. This closes the window where a demoted or removed user could keep
// acting (with a stale role) on an unexpired token. One indexed lookup per request.
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return next(new AppError('UNAUTHENTICATED', 'Missing bearer token'));
  if (!env.AUTH_JWT_SECRET) return next(new AppError('INTERNAL', 'AUTH_JWT_SECRET not configured'));

  let payload;
  try {
    payload = jwt.verify(match[1], env.AUTH_JWT_SECRET);
  } catch {
    return next(new AppError('UNAUTHENTICATED', 'Invalid or expired token'));
  }

  const user = await User.findOne({ username: payload.sub }).select('username role -_id').lean();
  if (!user) return next(new AppError('UNAUTHENTICATED', 'Account no longer exists'));

  // Re-read role from the DB (the token's role claim may be stale).
  req.user = { ...payload, sub: user.username, username: user.username, role: user.role };
  return next();
}

// Requires an authenticated user with the given role. Use after requireAuth.
export function requireRole(role) {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      return next(new AppError('FORBIDDEN', `Requires ${role} role`));
    }
    return next();
  };
}

// Read-only guard (Phase 8.8): the auditor role may read but never mutate. Use
// after requireAuth on routers that expose write endpoints.
export function blockAuditorWrites(req, _res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (req.user?.role === 'auditor' && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next(new AppError('FORBIDDEN', 'Auditor role is read-only'));
  }
  return next();
}
