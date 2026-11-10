'use strict';

const { AppError, toRestBody } = require('../errors');

function notFoundHandler(req, _res, next) {
  next(new AppError('NOT_FOUND', `No route matches ${req.method} ${req.path}.`));
}

// Express recognises an error handler by its 4-arg signature.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json(toRestBody(err));
  }
  // Body-parser / JSON syntax errors arrive as generic SyntaxErrors.
  if (err && err.type === 'entity.parse.failed') {
    const wrapped = new AppError('VALIDATION_ERROR', 'Request body is not valid JSON.');
    return res.status(wrapped.status).json(toRestBody(wrapped));
  }
  console.error('[unhandled]', err);
  const internal = new AppError('INTERNAL');
  return res.status(internal.status).json(toRestBody(internal));
}

module.exports = { notFoundHandler, errorHandler };
