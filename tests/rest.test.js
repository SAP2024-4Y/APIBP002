'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '5000';

const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { buildApp } = require('../src/app');

let app;
let demoToken;
let adminToken;

before(async () => {
  ({ app } = await buildApp());
  const demo = await request(app)
    .post('/api/v1/auth/token')
    .send({ username: 'demo', password: 'demo-password' });
  demoToken = demo.body.token;
  const admin = await request(app)
    .post('/api/v1/auth/token')
    .send({ username: 'admin', password: 'admin-password' });
  adminToken = admin.body.token;
});

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
});

test('auth: valid demo credentials issue a token', () => {
  assert.ok(demoToken && demoToken.length > 10);
});

test('auth: invalid credentials return 401 INVALID_CREDENTIALS', async () => {
  const res = await request(app)
    .post('/api/v1/auth/token')
    .send({ username: 'demo', password: 'wrong' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('List: default page returns products with rate-limit headers', async () => {
  const res = await request(app).get('/api/v1/products');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length > 0);
  assert.ok(res.headers['ratelimit-limit']);
  assert.ok(res.headers['ratelimit-remaining']);
});

test('List: status + price filtering', async () => {
  const res = await request(app).get('/api/v1/products?status=active&min_price=1000&max_price=20000');
  assert.strictEqual(res.status, 200);
  for (const p of res.body.data) {
    assert.strictEqual(p.status, 'active');
    assert.ok(p.price >= 1000 && p.price <= 20000);
  }
});

test('List: cursor pagination does not overlap pages', async () => {
  const first = await request(app).get('/api/v1/products?limit=5&sort=id&order=asc');
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.data.length, 5);
  assert.strictEqual(first.body.has_more, true);
  assert.ok(first.body.next_cursor);

  const second = await request(app).get(
    `/api/v1/products?limit=5&sort=id&order=asc&after=${encodeURIComponent(first.body.next_cursor)}`
  );
  assert.strictEqual(second.status, 200);
  const firstIds = new Set(first.body.data.map((p) => p.id));
  for (const p of second.body.data) assert.ok(!firstIds.has(p.id));
});

test('List: malformed cursor returns 400 INVALID_CURSOR', async () => {
  const res = await request(app).get('/api/v1/products?after=not-a-real-cursor');
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error.code, 'INVALID_CURSOR');
});

test('Map: radius search returns products with distance_km', async () => {
  const res = await request(app).get('/api/v1/products/map?latitude=12.9716&longitude=77.5946&radius_km=50');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.mode, 'radius');
  assert.ok(res.body.data.length > 0);
  assert.ok(typeof res.body.data[0].distance_km === 'number');
});

test('Map: bounding-box search works', async () => {
  const res = await request(app).get('/api/v1/products/map?min_lat=8&min_lon=68&max_lat=37&max_lon=97');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.mode, 'bbox');
  assert.ok(res.body.data.length > 0);
});

test('Map: invalid coordinates return 422 INVALID_COORDINATES', async () => {
  const res = await request(app).get('/api/v1/products/map?latitude=200&longitude=77&radius_km=5');
  assert.strictEqual(res.status, 422);
  assert.strictEqual(res.body.error.code, 'INVALID_COORDINATES');
});

test('Product: unknown id returns 404 PRODUCT_NOT_FOUND', async () => {
  const res = await request(app).get('/api/v1/products/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('Calendar: slots endpoint returns seeded slots', async () => {
  const res = await request(app).get('/api/v1/slots?product_id=prod_001');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length > 0);
});

test('Auth: booking without a token returns 401', async () => {
  const res = await request(app).post('/api/v1/bookings').send({ slot_id: 'slot_010_1' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'UNAUTHENTICATED');
});

test('Booking: valid demo token books a slot (201 + created id)', async () => {
  const res = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_010_1', quantity: 1 });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body.created.id);
  assert.strictEqual(res.body.created.slot_id, 'slot_010_1');
});

test('Calendar conflict: overlapping booking returns 409 BOOKING_OVERLAP', async () => {
  const res = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_011_1', quantity: 1 });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error.code, 'BOOKING_OVERLAP');
});

test('Calendar conflict: full slot returns 409 SLOT_FULL', async () => {
  const res = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_full_demo', quantity: 1 });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error.code, 'SLOT_FULL');
});

test('Authz: demo token is forbidden from admin-only create (403)', async () => {
  const res = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ name: 'X', category: 'Books', status: 'active', price: 100, latitude: 12.9, longitude: 77.5 });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error.code, 'FORBIDDEN');
});

test('Authz: admin token can create a product (201)', async () => {
  const res = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Admin Widget', category: 'Books', status: 'active', price: 100, latitude: 12.9, longitude: 77.5 });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body.created.id);
});
