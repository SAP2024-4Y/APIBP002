'use strict';

const express = require('express');
const { adminStats } = require('../services/stats');
const { requireAuth, requireRole } = require('../auth/middleware');

const router = express.Router();

// GET /api/v1/admin/stats — admin-only dashboard metrics
router.get('/stats', requireAuth, requireRole('admin'), (_req, res, next) => {
  try {
    res.status(200).json({ stats: adminStats() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
