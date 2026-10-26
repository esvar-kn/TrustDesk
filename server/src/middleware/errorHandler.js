import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';

// Terminal 404 for unmatched routes.
export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// Central error handler. Must keep all four args so Express treats it as one.
export function errorHandler(err, _req, res, _next) {
  let code = 'INTERNAL';
  let status = 500;
  let message = isProd ? 'Internal server error' : err?.message || 'Internal server error';
  let details;

  if (err instanceof AppError) {
    ({ code, status, message, details } = err);
  } else if (err instanceof ZodError) {
    code = 'VALIDATION_ERROR';
    status = 400;
    message = 'Invalid request';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err?.code === 11000) {
    // Mongo duplicate key — a unique constraint was hit.
    code = 'INVALID_STATE';
    status = 409;
    message = 'Duplicate key';
  }

  if (status >= 500) logger.error({ err }, 'request error');
  else logger.warn({ code, message }, 'request rejected');

  const body = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
}
