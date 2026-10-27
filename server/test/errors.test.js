// Error-model tests: fail() throws a coded AppError with the right status, and
// the central handler renders AppError / ZodError / Mongo dup-key consistently
// as { error: { code, message, details? } }. No DB — pure functions with a
// stubbed res.
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { fail, AppError, ERROR_STATUS } from '../src/errors.js';
import { errorHandler, notFound } from '../src/middleware/errorHandler.js';

function fakeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.payload = b;
      return this;
    },
  };
}

describe('fail() / AppError', () => {
  it('throws an AppError carrying the code and mapped status', () => {
    try {
      fail('NOT_FOUND', 'nope');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.status).toBe(404);
      expect(err.message).toBe('nope');
    }
  });

  it('defaults to status 500 for an unknown code', () => {
    expect(new AppError('MYSTERY').status).toBe(500);
  });

  it('carries optional details', () => {
    const err = new AppError('VALIDATION_ERROR', 'bad', { field: 'x' });
    expect(err.details).toEqual({ field: 'x' });
  });
});

describe('error handler', () => {
  it('renders an AppError with its status and code', () => {
    const res = fakeRes();
    errorHandler(new AppError('POLICY_BLOCKED', 'denied'), {}, res, () => {});
    expect(res.statusCode).toBe(422);
    expect(res.payload.error.code).toBe('POLICY_BLOCKED');
    expect(res.payload.error.message).toBe('denied');
  });

  it('maps a ZodError to a 400 VALIDATION_ERROR with field details', () => {
    const res = fakeRes();
    let zerr;
    try {
      z.object({ name: z.string() }).parse({});
    } catch (e) {
      zerr = e;
    }
    errorHandler(zerr, {}, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.payload.error.details)).toBe(true);
  });

  it('maps a Mongo duplicate-key error to 409 INVALID_STATE', () => {
    const res = fakeRes();
    errorHandler({ code: 11000 }, {}, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.payload.error.code).toBe('INVALID_STATE');
  });

  it('falls back to 500 INTERNAL for an unknown error', () => {
    const res = fakeRes();
    errorHandler(new Error('boom'), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.payload.error.code).toBe('INTERNAL');
  });

  it('notFound returns a 404 with a coded body', () => {
    const res = fakeRes();
    notFound({}, res);
    expect(res.statusCode).toBe(404);
    expect(res.payload.error.code).toBe('NOT_FOUND');
  });
});

describe('ERROR_STATUS contract', () => {
  it('maps the documented codes to their HTTP statuses', () => {
    expect(ERROR_STATUS.VALIDATION_ERROR).toBe(400);
    expect(ERROR_STATUS.UNAUTHENTICATED).toBe(401);
    expect(ERROR_STATUS.FORBIDDEN).toBe(403);
    expect(ERROR_STATUS.INVALID_STATE).toBe(409);
    expect(ERROR_STATUS.POLICY_BLOCKED).toBe(422);
    expect(ERROR_STATUS.AI_TIMEOUT).toBe(504);
  });
});
