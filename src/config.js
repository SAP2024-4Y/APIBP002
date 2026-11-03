'use strict';

const path = require('path');

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'shopmesh-demo-secret-change-in-prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'shopmesh.db'),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10),
  },
  // Documented demo accounts. The evaluator authenticates with `demo`.
  // `admin` exists so that a valid-but-unauthorized token can be shown to
  // return 403 on admin-only routes.
  accounts: [
    { username: 'demo', password: 'demo-password', role: 'customer' },
    { username: 'admin', password: 'admin-password', role: 'admin' },
  ],
};

module.exports = config;
