'use strict';

const config = require('../config');
const { AppError } = require('../errors');

// Fixed-window counter. In-memory is fine for a single-container demo; a
// production deployment would back this with Redis to share state across nodes.
const buckets = new Map();

function clientKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0].trim() : req.ip) || 'anonymous';
}

function consume(key) {
  const now = Date.now();
  const { windowMs, max } = config.rateLimit;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, max - bucket.count);
  const resetSeconds = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
  return { limited: bucket.count > max, limit: max, remaining, reset: resetSeconds };
}

function setHeaders(res, result) {
  res.set('RateLimit-Limit', String(result.limit));
  res.set('RateLimit-Remaining', String(result.remaining));
  res.set('RateLimit-Reset', String(result.reset));
}

function restRateLimit(req, res, next) {
  const result = consume(clientKey(req));
  setHeaders(res, result);
  if (result.limited) {
    res.set('Retry-After', String(result.reset));
    return next(new AppError('RATE_LIMITED'));
  }
  next();
}

// Reset the store (used by tests so limits don't leak between cases).
function _reset() {
  buckets.clear();
}

module.exports = { consume, setHeaders, restRateLimit, clientKey, _reset };
