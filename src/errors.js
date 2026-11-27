'use strict';

// Single source of truth for every domain error. Each code maps to one HTTP
// status (REST) and is surfaced verbatim as `extensions.code` (GraphQL), so the
// two paradigms stay in parity. Every entry also carries a `hint` telling the
// caller what to do next. Documented in docs/openapi.yaml and docs/ADR.md.
const CATALOGUE = {
  VALIDATION_ERROR: {
    status: 400,
    message: 'Request validation failed.',
    hint: 'Fix the field named in the message (allowed values are listed in /docs) and resend the request.',
  },
  INVALID_CURSOR: {
    status: 400,
    message: 'The provided pagination cursor is malformed.',
    hint: 'Pass next_cursor exactly as returned by the previous page, or omit `after` to start again from the first page.',
  },
  INVALID_CREDENTIALS: {
    status: 401,
    message: 'Username or password is incorrect.',
    hint: 'Check the username and password, then request a new token from POST /api/v1/auth/token.',
  },
  UNAUTHENTICATED: {
    status: 401,
    message: 'Authentication is required for this operation.',
    hint: 'Get a token from POST /api/v1/auth/token and send it as "Authorization: Bearer <token>".',
  },
  FORBIDDEN: {
    status: 403,
    message: 'You do not have permission to perform this action.',
    hint: 'This operation needs a different role (see the Roles note on each operation in /docs). Sign in with an account that has it.',
  },
  NOT_FOUND: {
    status: 404,
    message: 'The requested resource was not found.',
    hint: 'Check the path and id. All business endpoints live under /api/v1 — see /docs for the full list.',
  },
  PRODUCT_NOT_FOUND: {
    status: 404,
    message: 'No product exists with the given id.',
    hint: 'Find a valid product id with GET /api/v1/products (supports ?q= search).',
  },
  SLOT_NOT_FOUND: {
    status: 404,
    message: 'No delivery slot exists with the given id.',
    hint: 'List bookable slots with GET /api/v1/slots?product_id=<id> and use one of the returned ids.',
  },
  CONFLICT: {
    status: 409,
    message: 'A resource with that identifier already exists.',
    hint: 'Choose a different username or identifier and try again.',
  },
  SLOT_FULL: {
    message: 'The delivery slot has no remaining capacity.',
    hint: 'Pick another slot (details.alternatives lists open slots for the same product) or lower the quantity.',
  },
  BOOKING_OVERLAP: {
    status: 409,
    message: 'You already hold a booking that overlaps this slot window.',
    hint: 'Choose a slot in a different time window, or first cancel details.conflicting_booking_id via DELETE /api/v1/bookings/{id}.',
  },
  UNPROCESSABLE: {
    status: 422,
    message: 'The request was well-formed but semantically invalid.',
    hint: 'Correct the value named in the message so it falls inside the documented range (see /docs), then resend.',
  },
  INVALID_COORDINATES: {
    status: 422,
    message: 'Latitude/longitude or bounding-box values are out of range.',
    hint: 'Use latitude in [-90, 90], longitude in [-180, 180] and radius_km > 0; a bounding box needs its SW corner south-west of its NE corner.',
  },
  RATE_LIMITED: {
    status: 429,
    message: 'Too many requests. Slow down and retry later.',
    hint: 'Wait the number of seconds given in the Retry-After header, then retry.',
  },
  INTERNAL: {
    status: 500,
    message: 'An unexpected internal error occurred.',
    hint: 'Retry shortly; if it keeps failing, report the request time to the ShopMesh team.',
  },
};

class AppError extends Error {
  // `hint` overrides the catalogue hint when the situation calls for a more specific next step.
  constructor(code, message, details, hint) {
    const entry = CATALOGUE[code] || CATALOGUE.INTERNAL;
    super(message || entry.message);
    this.name = 'AppError';
    this.code = CATALOGUE[code] ? code : 'INTERNAL';
    this.status = entry.status;
    this.details = details;
    this.hint = hint || entry.hint;
    this.expose = true;
  }
}

function toRestBody(err) {
  return {
    error: {
      code: err.code || 'INTERNAL',
      message: err.message,
      hint: err.hint || CATALOGUE.INTERNAL.hint,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}

module.exports = { CATALOGUE, AppError, toRestBody };
