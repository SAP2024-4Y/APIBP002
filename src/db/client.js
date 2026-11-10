'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL,
  price_paise INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'INR',
  status      TEXT NOT NULL CHECK (status IN ('active','out_of_stock','discontinued')),
  seller      TEXT,
  rating      REAL,
  inventory   INTEGER NOT NULL DEFAULT 0,
  longitude   REAL NOT NULL,
  latitude    REAL NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slots (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  capacity   INTEGER NOT NULL,
  booked     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id         TEXT PRIMARY KEY,
  slot_id    TEXT NOT NULL REFERENCES slots(id),
  username   TEXT NOT NULL,
  quantity   INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_slots_product      ON slots(product_id);
CREATE INDEX IF NOT EXISTS idx_slots_window       ON slots(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user      ON bookings(username);
`;

let db;

function getDb() {
  if (db) return db;
  if (config.dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  }
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // `IF NOT EXISTS` everywhere makes boot idempotent: `docker compose down`
  // then `up` never crashes on pre-existing tables.
  db.exec(SCHEMA);
  return db;
}

module.exports = { getDb };
