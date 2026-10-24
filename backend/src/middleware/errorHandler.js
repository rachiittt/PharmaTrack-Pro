/**
 * Global error handler middleware.
 * All errors are returned as { error: string, code: string }.
 */
function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message || err);

  // Supabase/Postgres errors
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate record exists', code: 'DUPLICATE' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found', code: 'FK_VIOLATION' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  });
}

module.exports = { errorHandler };
