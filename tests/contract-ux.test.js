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

async function gql(query, bearer) {
  const req = request(app).post('/graphql').send({ query });
  if (bearer) req.set('Authorization', `Bearer ${bearer}`);
  return req;
}

before(async () => {
  ({ app } = await buildApp());
  demoToken = (
    await request(app).post('/api/v1/auth/token').send({ username: 'demo', password: 'demo-password' })
  ).body.token;
});

test('List: total_count reports all matches, independent of the page size', async () => {
  const res = await request(app).get('/api/v1/products?category=Books&limit=1');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.length, 1);
  assert.ok(res.body.total_count >= 1, 'total_count must be at least 1');
  assert.strictEqual(res.body.has_more, true);
});

test('List: category is a validated enum (case-insensitive)', async () => {
  const bad = await request(app).get('/api/v1/products?category=Nonexistent_Category_XYZ');
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.error.code, 'VALIDATION_ERROR');
  assert.match(bad.body.error.message, /Electronics/);

  const lower = await request(app).get('/api/v1/products?category=books');
  assert.strictEqual(lower.status, 200);
  assert.ok(lower.body.total_count >= 1, 'books category must have at least 1 product');
});

test('Errors: every REST error carries an instructive hint', async () => {
  const res = await request(app).get('/api/v1/products/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'PRODUCT_NOT_FOUND');
  assert.ok(res.body.error.hint && res.body.error.hint.length > 10);
});

test('SLOT_FULL suggests open alternative slots for the same product', async () => {
  const res = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_full_demo' });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error.code, 'SLOT_FULL');
  const { alternatives } = res.body.error.details;
  assert.ok(alternatives.length > 0);
  for (const alt of alternatives) {
    assert.ok(alt.slot_id.startsWith('slot_001_'));
    assert.ok(alt.available >= 1);
  }
});

test('BOOKING_OVERLAP names the conflicting booking so it can be cancelled', async () => {
  const first = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_020_2' });
  assert.strictEqual(first.status, 201);

  const clash = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_021_2' });
  assert.strictEqual(clash.status, 409);
  assert.strictEqual(clash.body.error.code, 'BOOKING_OVERLAP');
  assert.strictEqual(clash.body.error.details.conflicting_booking_id, first.body.created.id);
});

test('GraphQL: errors carry the same hint in extensions', async () => {
  const res = await gql('mutation{ bookSlot(slotId:"slot_010_1"){ id } }');
  assert.strictEqual(res.body.errors[0].extensions.code, 'UNAUTHENTICATED');
  assert.ok(res.body.errors[0].extensions.hint);
});

test('GraphQL: myBookings resolves slot and product in one round-trip', async () => {
  const res = await gql(
    '{ myBookings { id slot { id startsAt endsAt product { id name } } } }',
    demoToken
  );
  assert.strictEqual(res.status, 200);
  const booked = res.body.data.myBookings.find((b) => b.slot.id === 'slot_020_2');
  assert.ok(booked);
  assert.strictEqual(booked.slot.product.id, 'prod_020');
});
