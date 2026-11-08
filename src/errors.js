'use strict';

// Single source of truth for every domain error. Each code maps to one HTTP
// status (REST) and is surfaced verbatim as `extensions.code` (GraphQL), so the
// two paradigms stay in parity. Documented in docs/openapi.yaml and docs/ADR.md.
const CATALOGUE = {
  VALIDATION_ERROR: { status: 400, message: 'Request validation failed.' },
  INVALID_CURSOR: { status: 400, message: 'The provided pagination cursor is malformed.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Username or password is incorrect.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required for this operation.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },
  NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  PRODUCT_NOT_FOUND: { status: 404, message: 'No product exists with the given id.' },
  SLOT_NOT_FOUND: { status: 404, message: 'No delivery slot exists with the given id.' },
  SLOT_FULL: { status: 409, message: 'The delivery slot has no remaining capacity.' },
  BOOKING_OVERLAP: { status: 409, message: 'You already hold a booking that overlaps this slot window.' },
  UNPROCESSABLE: { status: 422, message: 'The request was well-formed but semantically invalid.' },
  INVALID_COORDINATES: { status: 422, message: 'Latitude/longitude or bounding-box values are out of range.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Slow down and retry later.' },
  INTERNAL: { status: 500, message: 'An unexpected internal error occurred.' },
};

class AppError extends Error {
  constructor(code, message, details) {
    const entry = CATALOGUE[code] || CATALOGUE.INTERNAL;
    super(message || entry.message);
    this.name = 'AppError';
    this.code = CATALOGUE[code] ? code : 'INTERNAL';
    this.status = entry.status;
    this.details = details;
    this.expose = true;
  }
}

function toRestBody(err) {
  return {
    error: {
      code: err.code || 'INTERNAL',
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}

module.exports = { CATALOGUE, AppError, toRestBody };
