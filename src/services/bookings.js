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
    .prepare(
      `SELECT b.*, s.product_id FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.username = ? ORDER BY b.created_at DESC`
    )
    .all(username);
}

function getBookingById(id, username) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT b.*, s.product_id FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.id = ?`
    )
    .get(id);
  if (!row) throw new AppError('NOT_FOUND', 'No booking exists with the given id.');
  if (username && row.username !== username) {
    throw new AppError('FORBIDDEN', 'You can only view your own bookings.');
  }
  return row;
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

  // Check overlap before entering the transaction (read-only, no race risk here).
  const overlap = db
    .prepare(
      `SELECT b.id, b.slot_id FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.username = ? AND s.id != ? AND s.starts_at < ? AND s.ends_at > ?
       LIMIT 1`
    )
    .get(username, slot.id, slot.ends_at, slot.starts_at);
  if (overlap) {
    throw new AppError('BOOKING_OVERLAP', undefined, {
      conflicting_booking_id: overlap.id,
      conflicting_slot_id: overlap.slot_id,
    });
  }

  const booking = {
    id: newId('bk'),
    slot_id: slot.id,
    product_id: slot.product_id,
    username,
    quantity: qty,
    created_at: new Date().toISOString(),
  };

  // Atomic capacity guard: UPDATE only succeeds when capacity is not exceeded.
  // If the UPDATE touches 0 rows, another request won the race — return SLOT_FULL.
  const tx = db.transaction(() => {
    const updated = db
      .prepare(
        'UPDATE slots SET booked = booked + ? WHERE id = ? AND booked + ? <= capacity'
      )
      .run(qty, slot.id, qty);

    if (updated.changes === 0) {
      // Re-read to build a fresh alternatives list.
      const fresh = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot.id);
      const alternatives = db
        .prepare(
          `SELECT id, starts_at, ends_at, capacity - booked AS available FROM slots
           WHERE product_id = ? AND id != ? AND capacity - booked >= ? AND starts_at > ?
           ORDER BY starts_at ASC, id ASC LIMIT 3`
        )
        .all(fresh.product_id, fresh.id, qty, new Date().toISOString())
        .map((a) => ({ slot_id: a.id, starts_at: a.starts_at, ends_at: a.ends_at, available: a.available }));
      throw new AppError(
        'SLOT_FULL',
        `Only ${fresh.capacity - fresh.booked} unit(s) remain in this slot.`,
        { slot_id: fresh.id, requested: qty, available: fresh.capacity - fresh.booked, alternatives },
        alternatives.length
          ? undefined
          : 'No other upcoming slot for this product can take that quantity. Lower the quantity or choose another product.'
      );
    }

    db.prepare(
      'INSERT INTO bookings (id, slot_id, username, quantity, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(booking.id, booking.slot_id, booking.username, booking.quantity, booking.created_at);
  });
  tx();

  return booking;
}

function createSlot({ productId, startsAt, endsAt, capacity }) {
  const db = getDb();
  if (!productId) throw new AppError('VALIDATION_ERROR', 'product_id is required.');
  const from = assertIso(startsAt, 'starts_at');
  const to = assertIso(endsAt, 'ends_at');
  if (!from) throw new AppError('VALIDATION_ERROR', 'starts_at is required.');
  if (!to) throw new AppError('VALIDATION_ERROR', 'ends_at is required.');
  if (from >= to) throw new AppError('VALIDATION_ERROR', 'starts_at must be strictly before ends_at.');
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < 1) {
    throw new AppError('VALIDATION_ERROR', 'capacity must be a positive integer.');
  }
  // Verify product exists (throws PRODUCT_NOT_FOUND if not).
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) throw new AppError('PRODUCT_NOT_FOUND');

  const slot = { id: newId('slot'), product_id: productId, starts_at: from, ends_at: to, capacity: cap, booked: 0 };
  db.prepare(
    'INSERT INTO slots (id, product_id, starts_at, ends_at, capacity, booked) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(slot.id, slot.product_id, slot.starts_at, slot.ends_at, slot.capacity);
  return slot;
}

function listBookingsForSlot(slotId) {
  const db = getDb();
  getSlotById(slotId); // throws SLOT_NOT_FOUND if absent
  return db
    .prepare(
      `SELECT b.*, s.product_id FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.slot_id = ? ORDER BY b.created_at ASC`
    )
    .all(slotId);
}

function deleteSlot(slotId, productId) {
  const db = getDb();
  const slot = getSlotById(slotId); // SLOT_NOT_FOUND if absent
  if (productId && slot.product_id !== productId) {
    throw new AppError('NOT_FOUND', 'Slot does not belong to this product.');
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bookings WHERE slot_id = ?').run(slotId);
    db.prepare('DELETE FROM slots WHERE id = ?').run(slotId);
  });
  tx();
  return { id: slotId, product_id: slot.product_id, deleted: true };
}

// Cancel a booking the caller owns, releasing the slot capacity.
function cancelBooking({ id, username }) {
  const db = getDb();
  if (!username) throw new AppError('UNAUTHENTICATED');
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) throw new AppError('NOT_FOUND', 'No booking exists with the given id.');
  if (booking.username !== username) {
    throw new AppError('FORBIDDEN', 'You can only cancel your own bookings.');
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    db.prepare('UPDATE slots SET booked = MAX(0, booked - ?) WHERE id = ?').run(
      booking.quantity,
      booking.slot_id
    );
  });
  tx();
  return { id, slot_id: booking.slot_id, cancelled: true };
}

module.exports = { listSlots, getSlotById, listBookingsForSlot, deleteSlot, listBookingsForUser, getBookingById, createSlot, createBooking, cancelBooking };
