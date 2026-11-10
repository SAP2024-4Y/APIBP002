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

before(async () => {
  ({ app } = await buildApp());
  adminToken = (await request(app).post('/api/v1/auth/token').send({ username: 'admin', password: 'admin-password' })).body.token;
  demoToken = (await request(app).post('/api/v1/auth/token').send({ username: 'demo', password: 'demo-password' })).body.token;
});

test('admin stats returns catalogue metrics', async () => {
  const res = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.stats.products >= 20);
  assert.ok(Number.isInteger(res.body.stats.total_inventory));
  assert.ok(res.body.stats.by_status.active >= 1);
});

test('admin stats is forbidden for non-admins (403)', async () => {
  const res = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${demoToken}`);
  assert.strictEqual(res.status, 403);
});

test('admin stats requires a token (401)', async () => {
  const res = await request(app).get('/api/v1/admin/stats');
  assert.strictEqual(res.status, 401);
});
