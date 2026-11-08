'use strict';

const { principalFromHeader } = require('./jwt');
const { AppError } = require('../errors');

// Populates req.user from the Bearer token if present (never rejects here, so
// public read endpoints keep working for anonymous callers).
function attachUser(req, _res, next) {
  req.user = principalFromHeader(req.headers.authorization);
  next();
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(new AppError('UNAUTHENTICATED'));
  next();
}

function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('UNAUTHENTICATED'));
    if (req.user.role !== role) return next(new AppError('FORBIDDEN'));
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
