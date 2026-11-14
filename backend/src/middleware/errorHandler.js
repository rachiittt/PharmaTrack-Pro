'use strict';

const { HttpError } = require('../lib/errors');

/**
 * Global error handler. Every error leaves as { error, code, details? }.
 * Unknown errors are logged server-side and returned as a generic 500 so
 * internals (SQL, stack traces, keys) never reach the client.
 */
function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...(err.details && { details: err.details }) });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body', code: 'INVALID_INPUT' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' });
}

function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}`, code: 'NOT_FOUND' });
}

module.exports = { errorHandler, notFound };
