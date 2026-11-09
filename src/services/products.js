'use strict';

const { getDb } = require('../db/client');
const { AppError } = require('../errors');
const { encodeCursor, decodeCursor } = require('../util/cursor');
const { haversineKm, isValidLat, isValidLon } = require('../util/geo');
const { newId } = require('../db/seed');

const SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  price: 'price_paise',
  rating: 'rating',
  created_at: 'created_at',
};
const STATUSES = ['active', 'out_of_stock', 'discontinued'];

function parsePrice(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new AppError('VALIDATION_ERROR', `${label} must be a non-negative number (in INR).`);
  }
  return n;
}

function buildBaseFilters(params) {
  const where = [];
  const args = [];

  if (params.status !== undefined && params.status !== '') {
    if (!STATUSES.includes(params.status)) {
      throw new AppError('VALIDATION_ERROR', `status must be one of: ${STATUSES.join(', ')}.`);
    }
    where.push('status = ?');
    args.push(params.status);
  }
  if (params.category !== undefined && params.category !== '') {
    where.push('category = ?');
    args.push(params.category);
  }
  if (params.q !== undefined && params.q !== '') {
    where.push('(name LIKE ? OR description LIKE ?)');
    const like = `%${params.q}%`;
    args.push(like, like);
  }

  const minPrice = parsePrice(params.minPrice, 'min_price');
  const maxPrice = parsePrice(params.maxPrice, 'max_price');
  if (minPrice !== null) {
    where.push('price_paise >= ?');
    args.push(Math.round(minPrice * 100));
  }
  if (maxPrice !== null) {
    where.push('price_paise <= ?');
    args.push(Math.round(maxPrice * 100));
  }
  return { where, args };
}

function countProducts(params = {}) {
  const { where, args } = buildBaseFilters(params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb().prepare(`SELECT COUNT(*) AS c FROM products ${whereSql}`).get(...args).c;
}

function listProducts(params = {}) {
  const db = getDb();
  const { where, args } = buildBaseFilters(params);

  const sortField = params.sort || 'created_at';
  const col = SORT_COLUMNS[sortField];
  if (!col) {
    throw new AppError('VALIDATION_ERROR', `sort must be one of: ${Object.keys(SORT_COLUMNS).join(', ')}.`);
  }
  const order = String(params.order || 'desc').toLowerCase();
  if (!['asc', 'desc'].includes(order)) {
    throw new AppError('VALIDATION_ERROR', "order must be 'asc' or 'desc'.");
  }

  let limit = params.limit === undefined || params.limit === '' ? 20 : Number(params.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError('VALIDATION_ERROR', 'limit must be a positive integer.');
  }
  limit = Math.min(limit, 100);

  if (params.after) {
    const cursor = decodeCursor(params.after);
    const op = order === 'asc' ? '>' : '<';
    // keyset: strictly after (sortValue, id) in the active sort direction
    where.push(`(${col} ${op} ? OR (${col} = ? AND id ${op} ?))`);
    args.push(cursor.v, cursor.v, cursor.id);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = order.toUpperCase();
  const sql = `SELECT * FROM products ${whereSql} ORDER BY ${col} ${dir}, id ${dir} LIMIT ?`;
  const rows = db.prepare(sql).all(...args, limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  let nextCursor = null;
  if (hasMore && page.length) {
    const last = page[page.length - 1];
    nextCursor = encodeCursor(last[col], last.id);
  }
  return { items: page, hasMore, nextCursor, limit, sort: sortField, order, column: col };
}

function getProductById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!row) throw new AppError('PRODUCT_NOT_FOUND');
  return row;
}

function productsNear({ latitude, longitude, radiusKm }) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const radius = Number(radiusKm);
  if (!isValidLat(lat) || !isValidLon(lon)) {
    throw new AppError('INVALID_COORDINATES', 'latitude must be in [-90,90] and longitude in [-180,180].');
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new AppError('INVALID_COORDINATES', 'radius_km must be a positive number.');
  }
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products').all();
  return rows
    .map((row) => ({ product: row, distanceKm: haversineKm(lat, lon, row.latitude, row.longitude) }))
    .filter((hit) => hit.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function productsInBounds({ minLat, minLon, maxLat, maxLon }) {
  const sw = { lat: Number(minLat), lon: Number(minLon) };
  const ne = { lat: Number(maxLat), lon: Number(maxLon) };
  if (![sw.lat, ne.lat].every(isValidLat) || ![sw.lon, ne.lon].every(isValidLon)) {
    throw new AppError('INVALID_COORDINATES', 'Bounding-box corners contain out-of-range coordinates.');
  }
  if (sw.lat > ne.lat || sw.lon > ne.lon) {
    throw new AppError('INVALID_COORDINATES', 'SW corner must be south-west of the NE corner.');
  }
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM products WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY id ASC'
    )
    .all(sw.lat, ne.lat, sw.lon, ne.lon);
}

// Admin-only mutation. Exists primarily so a valid non-admin ("demo") token
// can be shown to receive 403 while an admin token receives 201 + created id.
function createProduct(input = {}) {
  for (const field of ['name', 'category', 'status']) {
    if (!input[field]) throw new AppError('VALIDATION_ERROR', `${field} is required.`);
  }
  if (!STATUSES.includes(input.status)) {
    throw new AppError('VALIDATION_ERROR', `status must be one of: ${STATUSES.join(', ')}.`);
  }
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new AppError('UNPROCESSABLE', 'price must be a non-negative number (in INR).');
  }
  const lon = Number(input.longitude);
  const lat = Number(input.latitude);
  if (!isValidLon(lon) || !isValidLat(lat)) {
    throw new AppError('INVALID_COORDINATES', 'longitude/latitude are required and must be valid.');
  }
  const row = {
    id: newId('prod'),
    name: input.name,
    description: input.description || null,
    category: input.category,
    price_paise: Math.round(price * 100),
    currency: input.currency || 'INR',
    status: input.status,
    seller: input.seller || null,
    rating: input.rating === undefined ? null : Number(input.rating),
    inventory: input.inventory === undefined ? 0 : Math.max(0, Math.trunc(Number(input.inventory) || 0)),
    longitude: lon,
    latitude: lat,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO products
        (id, name, description, category, price_paise, currency, status, seller, rating, inventory, longitude, latitude, created_at)
       VALUES (@id, @name, @description, @category, @price_paise, @currency, @status, @seller, @rating, @inventory, @longitude, @latitude, @created_at)`
    )
    .run(row);
  return row;
}

// Admin: partial update of a product. Only known fields are writable.
function updateProduct(id, patch = {}) {
  const existing = getProductById(id); // throws PRODUCT_NOT_FOUND
  const sets = [];
  const args = {};
  const put = (col, val) => { sets.push(`${col} = @${col}`); args[col] = val; };

  if (patch.name !== undefined) put('name', String(patch.name));
  if (patch.description !== undefined) put('description', patch.description === null ? null : String(patch.description));
  if (patch.category !== undefined) put('category', String(patch.category));
  if (patch.seller !== undefined) put('seller', patch.seller === null ? null : String(patch.seller));
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw new AppError('VALIDATION_ERROR', `status must be one of: ${STATUSES.join(', ')}.`);
    put('status', patch.status);
  }
  if (patch.price !== undefined) {
    const price = Number(patch.price);
    if (!Number.isFinite(price) || price < 0) throw new AppError('UNPROCESSABLE', 'price must be a non-negative number.');
    put('price_paise', Math.round(price * 100));
  }
  if (patch.rating !== undefined) put('rating', patch.rating === null ? null : Number(patch.rating));
  if (patch.inventory !== undefined) {
    const inv = Number(patch.inventory);
    if (!Number.isFinite(inv) || inv < 0) throw new AppError('UNPROCESSABLE', 'inventory must be a non-negative integer.');
    put('inventory', Math.trunc(inv));
  }
  if (patch.latitude !== undefined || patch.longitude !== undefined) {
    const lat = Number(patch.latitude === undefined ? existing.latitude : patch.latitude);
    const lon = Number(patch.longitude === undefined ? existing.longitude : patch.longitude);
    if (!isValidLat(lat) || !isValidLon(lon)) throw new AppError('INVALID_COORDINATES', 'latitude/longitude out of range.');
    put('latitude', lat);
    put('longitude', lon);
  }
  if (sets.length === 0) throw new AppError('VALIDATION_ERROR', 'No updatable fields were provided.');

  args.id = id;
  getDb().prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = @id`).run(args);
  return getProductById(id);
}

// Admin: delete a product and cascade its slots + bookings in one transaction.
function deleteProduct(id) {
  const db = getDb();
  getProductById(id); // throws PRODUCT_NOT_FOUND
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE product_id = ?)').run(id);
    db.prepare('DELETE FROM slots WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
  });
  tx();
  return { id, deleted: true };
}

module.exports = {
  listProducts,
  countProducts,
  getProductById,
  productsNear,
  productsInBounds,
  createProduct,
  updateProduct,
  deleteProduct,
  SORT_COLUMNS,
  STATUSES,
};
