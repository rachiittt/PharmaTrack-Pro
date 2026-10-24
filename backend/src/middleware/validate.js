/**
 * Zod validation middleware factory.
 * Validates req.body against the provided Zod schema.
 * Returns 400 with field-level errors on failure.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: fieldErrors,
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        code: 'QUERY_VALIDATION_ERROR',
        details: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    req.validatedQuery = result.data;
    next();
  };
}

module.exports = { validate, validateQuery };
