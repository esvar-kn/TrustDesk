import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors.js';

// Verifies a Bearer JWT and attaches the decoded payload to req.user.
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return next(new AppError('UNAUTHENTICATED', 'Missing bearer token'));
  if (!env.AUTH_JWT_SECRET) return next(new AppError('INTERNAL', 'AUTH_JWT_SECRET not configured'));
  try {
    req.user = jwt.verify(match[1], env.AUTH_JWT_SECRET);
    return next();
  } catch {
    return next(new AppError('UNAUTHENTICATED', 'Invalid or expired token'));
  }
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
