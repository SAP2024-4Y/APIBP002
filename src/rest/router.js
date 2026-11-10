'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const productRoutes = require('./products.routes');
const bookingRoutes = require('./bookings.routes');

// All business endpoints live under /api/v1 (URI-path versioning).
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/', bookingRoutes);

module.exports = router;
