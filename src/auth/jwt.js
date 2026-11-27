'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../errors');
const { getDb } = require('../db/client');

function issueToken(username, password) {
  // Check hardcoded demo accounts first, then registered users in DB.
  const demo = config.accounts.find(
    (a) => a.username === username && a.password === password
  );
  if (demo) {
    const token = jwt.sign(
      { sub: demo.username, role: demo.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    return { token, tokenType: 'Bearer', expiresIn: config.jwtExpiresIn, role: demo.role };
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.password !== password) throw new AppError('INVALID_CREDENTIALS');
  const token = jwt.sign(
    { sub: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  return { token, tokenType: 'Bearer', expiresIn: config.jwtExpiresIn, role: user.role };
}

function registerUser(username, password, email) {
  const db = getDb();
  if (!username || username.length < 3) {
    throw new AppError('VALIDATION_ERROR', 'username must be at least 3 characters.');
  }
  if (!password || password.length < 6) {
    throw new AppError('VALIDATION_ERROR', 'password must be at least 6 characters.');
  }
  // Block registering over demo accounts
  const reserved = config.accounts.find((a) => a.username === username);
  if (reserved) throw new AppError('CONFLICT', 'Username is already taken.');
  const existing = db.prepare('SELECT username FROM users WHERE username = ?').get(username);
  if (existing) throw new AppError('CONFLICT', 'Username is already taken.');
  db.prepare(
    'INSERT INTO users (username, password, role, email, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(username, password, 'customer', email || null, new Date().toISOString());
  return issueToken(username, password);
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

module.exports = { issueToken, registerUser, verifyToken, principalFromHeader };
