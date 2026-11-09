'use strict';

const express = require('express');
const { issueToken } = require('../auth/jwt');
const { AppError } = require('../errors');

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

module.exports = router;
