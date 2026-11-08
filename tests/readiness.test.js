'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '5000';

const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { buildApp } = require('../src/app');

let app;
before(async () => { ({ app } = await buildApp()); });

test('GET /ready reports a seeded, queryable database', async () => {
  const res = await request(app).get('/ready');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ready');
  assert.ok(res.body.products >= 20, 'at least 20 products seeded');
  assert.ok(res.body.slots >= res.body.products, 'each product has slots');
});
