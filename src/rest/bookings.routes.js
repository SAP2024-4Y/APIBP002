'use strict';

const express = require('express');
const bookings = require('../services/bookings');
const { requireAuth } = require('../auth/middleware');
const { AppError } = require('../errors');
const { slotToRest, bookingToRest } = require('./presenters');

const router = express.Router();

// GET /api/v1/slots — Calendar API: time-window filtering
router.get('/slots', (req, res, next) => {
  try {
    const rows = bookings.listSlots({
      productId: req.query.product_id,
      startsAt: req.query.starts_at,
      endsAt: req.query.ends_at,
    });
    res.status(200).json({ data: rows.map(slotToRest) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/bookings — mutating, auth-required; 409 on conflict
router.post('/bookings', requireAuth, (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.slot_id) throw new AppError('VALIDATION_ERROR', 'slot_id is required.');
    const booking = bookings.createBooking({
      slotId: body.slot_id,
      quantity: body.quantity === undefined ? 1 : body.quantity,
      username: req.user.username,
    });
    res.status(201).json({ created: bookingToRest(booking) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bookings — the authenticated user's bookings
router.get('/bookings', requireAuth, (req, res, next) => {
  try {
    const rows = bookings.listBookingsForUser(req.user.username);
    res.status(200).json({ data: rows.map(bookingToRest) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
