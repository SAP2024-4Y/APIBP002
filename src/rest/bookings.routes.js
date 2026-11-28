'use strict';

const express = require('express');
const bookings = require('../services/bookings');
const { requireAuth } = require('../auth/middleware');
const { AppError } = require('../errors');
const { slotToRest, bookingToRest } = require('./presenters');

const router = express.Router();

// GET /api/v1/slots — Calendar API: time-window filtering across all products
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

// GET /api/v1/slots/:id — single slot by id
router.get('/slots/:id', (req, res, next) => {
  try {
    const slot = bookings.getSlotById(req.params.id);
    res.status(200).json(slotToRest(slot));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/slots/:id/bookings — list all bookings for a slot (admin only)
router.get('/slots/:id/bookings', requireAuth, (req, res, next) => {
  try {
    const rows = bookings.listBookingsForSlot(req.params.id);
    res.status(200).json({ data: rows.map(bookingToRest), slot_id: req.params.id, count: rows.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/bookings — legacy flat booking; prefer POST /products/{id}/slots/{slotId}/bookings
router.post('/bookings', requireAuth, (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Link', '</api/v1/products/{product_id}/slots/{slot_id}/bookings>; rel="successor-version"');
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

// GET /api/v1/bookings/:id — single booking (owner only)
router.get('/bookings/:id', requireAuth, (req, res, next) => {
  try {
    const booking = bookings.getBookingById(req.params.id, req.user.username);
    res.status(200).json(bookingToRest(booking));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/bookings/:id — cancel an owned booking (releases capacity)
router.delete('/bookings/:id', requireAuth, (req, res, next) => {
  try {
    const result = bookings.cancelBooking({ id: req.params.id, username: req.user.username });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
