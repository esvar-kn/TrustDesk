// Coded application errors. Services/routes throw via `fail(code, ...)`; the
// central error handler renders them as { error: { code, message, details } }.
// Status codes follow the API contract.
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  APPROVAL_REQUIRED: 409,
  GUARDRAIL_BLOCKED: 422,
  POLICY_BLOCKED: 422,
  AI_PROVIDER_ERROR: 502,
  TOOL_EXECUTION_FAILED: 502,
  AI_TIMEOUT: 504,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
    if (details !== undefined) this.details = details;
  }
}

// Throw a coded error. Express 5 forwards both sync throws and rejected promises
// to the error handler, so this works in plain and async handlers alike.
export function fail(code, message, details) {
  throw new AppError(code, message, details);
}
