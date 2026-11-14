'use strict';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Postgres / PostgREST error codes raised by our RPCs and constraints.
const PG_STATUS = {
  '28000': [401, 'UNAUTHENTICATED'],
  '42501': [403, 'FORBIDDEN'],
  P0002: [404, 'NOT_FOUND'],
  '22023': [400, 'INVALID_INPUT'],
  '23514': [409, 'CONSTRAINT'],
  '23505': [409, 'DUPLICATE'],
  '23503': [409, 'IN_USE'],
  '54000': [429, 'LIMIT_REACHED'],
  PGRST116: [404, 'NOT_FOUND'],
};

/** Convert a Supabase/PostgREST error into an HttpError with a safe message. */
function fromSupabaseError(err) {
  if (!err) return null;
  const mapped = PG_STATUS[err.code];
  if (mapped) return new HttpError(mapped[0], mapped[1], err.message);
  return new HttpError(502, 'DATABASE_ERROR', 'The database request failed');
}

/** Throw if a Supabase response carries an error; otherwise return its data. */
function unwrap({ data, error }) {
  if (error) throw fromSupabaseError(error);
  return data;
}

module.exports = { HttpError, fromSupabaseError, unwrap };
