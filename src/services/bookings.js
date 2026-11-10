'use strict';

const { getDb } = require('../db/client');
const { AppError } = require('../errors');
const { newId } = require('../db/seed');

function assertIso(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) {
    throw new AppError('VALIDATION_ERROR', `${label} must be an ISO-8601 UTC timestamp (e.g. 2026-12-01T09:00:00Z).`);
  }
  return new Date(t).toISOString();
}

// Returns slots overlapping the [startsAt, endsAt] window. Overlap rule:
// slot.starts_at < endsAt AND slot.ends_at > startsAt. Either bound may be
// omitted for an open-ended window.
function listSlots({ productId, startsAt, endsAt } = {}) {
  const db = getDb();
  const where = [];
  const args = [];
  const from = assertIso(startsAt, 'starts_at');
  const to = assertIso(endsAt, 'ends_at');

  if (productId !== undefined && productId !== '') {
    where.push('product_id = ?');
    args.push(productId);
  }
  if (from) {
    where.push('ends_at > ?');
    args.push(from);
  }
  if (to) {
    where.push('starts_at < ?');
    args.push(to);
  }
  if (from && to && from >= to) {
    throw new AppError('VALIDATION_ERROR', 'starts_at must be strictly before ends_at.');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM slots ${whereSql} ORDER BY starts_at ASC, id ASC`).all(...args);
}

function getSlotById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM slots WHERE id = ?').get(id);
  if (!row) throw new AppError('SLOT_NOT_FOUND');
  return row;
}

function listBookingsForUser(username) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM bookings WHERE username = ? ORDER BY created_at DESC')
    .all(username);
}

// Core Calendar conflict logic. Two distinct 409 outcomes:
//   SLOT_FULL        — remaining capacity cannot absorb the requested quantity
//   BOOKING_OVERLAP  — the user already holds a booking whose slot window
//                      overlaps the target slot window
function createBooking({ slotId, quantity = 1, username }) {
  const db = getDb();
  if (!username) throw new AppError('UNAUTHENTICATED');

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) {
    throw new AppError('UNPROCESSABLE', 'quantity must be a positive integer.');
  }

  const slot = getSlotById(slotId);

  if (slot.booked + qty > slot.capacity) {
    throw new AppError('SLOT_FULL', `Only ${slot.capacity - slot.booked} unit(s) remain in this slot.`);
  }

  const overlap = db
    .prepare(
      `SELECT b.id FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.username = ? AND s.id != ? AND s.starts_at < ? AND s.ends_at > ?
       LIMIT 1`
    )
    .get(username, slot.id, slot.ends_at, slot.starts_at);
  if (overlap) {
    throw new AppError('BOOKING_OVERLAP');
  }

  const booking = {
    id: newId('bk'),
    slot_id: slot.id,
    username,
    quantity: qty,
    created_at: new Date().toISOString(),
  };

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO bookings (id, slot_id, username, quantity, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(booking.id, booking.slot_id, booking.username, booking.quantity, booking.created_at);
    db.prepare('UPDATE slots SET booked = booked + ? WHERE id = ?').run(qty, slot.id);
  });
  tx();

  return booking;
}

module.exports = { listSlots, getSlotById, listBookingsForUser, createBooking };
