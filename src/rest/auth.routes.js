'use strict';

const express = require('express');
const { issueToken, registerUser } = require('../auth/jwt');
const { requireAuth } = require('../auth/middleware');
const { AppError } = require('../errors');
const { getDb } = require('../db/client');
const config = require('../config');

const router = express.Router();

// POST /api/v1/auth/token  — works WITHOUT an existing token (demo-account login)
router.post('/token', (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw new AppError('VALIDATION_ERROR', 'username and password are required.');
    }
    const result = issueToken(username, password);
    res.status(200).json({
      token: result.token,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      role: result.role,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/register  — create a new customer account
router.post('/register', (req, res, next) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !password) {
      throw new AppError('VALIDATION_ERROR', 'username and password are required.');
    }
    const result = registerUser(username, password, email);
    res.status(201).json({
      token: result.token,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      role: result.role,
      message: 'Account created successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me — return the authenticated caller's profile
router.get('/me', requireAuth, (req, res, next) => {
  try {
    const { username, role } = req.user;
    // Demo accounts don't live in the DB; construct a synthetic profile.
    const isDemo = config.accounts.some((a) => a.username === username);
    if (isDemo) {
      return res.status(200).json({ username, role, email: null, created_at: null, demo: true });
    }
    const db = getDb();
    const row = db.prepare('SELECT username, role, email, created_at FROM users WHERE username = ?').get(username);
    if (!row) throw new AppError('NOT_FOUND', 'User record not found.');
    res.status(200).json({ ...row, demo: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
