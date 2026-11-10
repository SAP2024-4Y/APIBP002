'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '5000';

const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { buildApp } = require('../src/app');

let app;
let adminToken;
let demoToken;
let createdId;

before(async () => {
  ({ app } = await buildApp());
  adminToken = (await request(app).post('/api/v1/auth/token').send({ username: 'admin', password: 'admin-password' })).body.token;
  demoToken = (await request(app).post('/api/v1/auth/token').send({ username: 'demo', password: 'demo-password' })).body.token;
  const created = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Test Widget', category: 'Books', status: 'active', price: 199, inventory: 10, latitude: 12.9, longitude: 77.5 });
  createdId = created.body.created.id;
});

test('admin can PATCH a product (price + inventory)', async () => {
  const res = await request(app)
    .patch(`/api/v1/products/${createdId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ price: 249, inventory: 5, status: 'out_of_stock' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.updated.price, 249);
  assert.strictEqual(res.body.updated.inventory, 5);
  assert.strictEqual(res.body.updated.status, 'out_of_stock');
});

test('demo (non-admin) PATCH is forbidden (403)', async () => {
  const res = await request(app)
    .patch(`/api/v1/products/${createdId}`)
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ price: 1 });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error.code, 'FORBIDDEN');
});

test('PATCH unknown product returns 404', async () => {
  const res = await request(app)
    .patch('/api/v1/products/prod_nope')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ price: 1 });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('admin can DELETE a product, then it is gone (404)', async () => {
  const del = await request(app)
    .delete(`/api/v1/products/${createdId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(del.status, 200);
  assert.strictEqual(del.body.deleted, true);
  const get = await request(app).get(`/api/v1/products/${createdId}`);
  assert.strictEqual(get.status, 404);
});

test('deleting a seeded product cascades its slots', async () => {
  const del = await request(app)
    .delete('/api/v1/products/prod_002')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(del.status, 200);
  const slots = await request(app).get('/api/v1/slots?product_id=prod_002');
  assert.strictEqual(slots.body.data.length, 0);
});
