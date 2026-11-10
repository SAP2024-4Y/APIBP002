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

test('REST: ?q= filters products by name/description', async () => {
  const res = await request(app).get('/api/v1/products?q=Headphones');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length >= 1);
  assert.ok(res.body.data.every((p) => /headphone/i.test(p.name) || /headphone/i.test(p.description || '')));
});

test('GraphQL: products(q:) applies the same filter', async () => {
  const res = await request(app)
    .post('/graphql')
    .send({ query: '{ products(q:"Atomic"){ totalCount edges{ node{ name } } } }' });
  assert.strictEqual(res.status, 200);
  const conn = res.body.data.products;
  assert.ok(conn.totalCount >= 1);
  assert.ok(conn.edges.some((e) => /atomic/i.test(e.node.name)));
});
