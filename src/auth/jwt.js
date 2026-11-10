'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../errors');

function issueToken(username, password) {
  const account = config.accounts.find(
    (a) => a.username === username && a.password === password
  );
  if (!account) throw new AppError('INVALID_CREDENTIALS');
  const token = jwt.sign(
    { sub: account.username, role: account.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  return { token, tokenType: 'Bearer', expiresIn: config.jwtExpiresIn, role: account.role };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (_err) {
    throw new AppError('UNAUTHENTICATED', 'Bearer token is missing, invalid, or expired.');
  }
}

// Returns the decoded principal or null; never throws (used to populate context).
function principalFromHeader(authorizationHeader) {
  if (!authorizationHeader) return null;
  const [scheme, token] = String(authorizationHeader).split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return { username: decoded.sub, role: decoded.role };
  } catch (_err) {
    return null;
  }
}

module.exports = { issueToken, verifyToken, principalFromHeader };
