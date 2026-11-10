'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const productRoutes = require('./products.routes');
const bookingRoutes = require('./bookings.routes');
const adminRoutes = require('./admin.routes');

// All business endpoints live under /api/v1 (URI-path versioning).
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/admin', adminRoutes);
router.use('/', bookingRoutes);

module.exports = router;
