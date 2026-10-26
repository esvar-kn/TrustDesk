// Validates req.body against a Zod schema, replacing it with the parsed value.
// A failure forwards the ZodError, which the error handler renders as
// VALIDATION_ERROR (400).
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    return next();
  };
}
