'use strict';

const { AppError } = require('../errors');

// Opaque, stable cursor: base64url(JSON{ v, id }). Clients must treat it as a
// black box; its only contract is "feed it back as `after`".
function encodeCursor(value, id) {
  const payload = JSON.stringify({ v: value, id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  try {
    const json = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!('v' in parsed) || !('id' in parsed)) throw new Error('missing fields');
    return parsed;
  } catch (_err) {
    throw new AppError('INVALID_CURSOR');
  }
}

module.exports = { encodeCursor, decodeCursor };
