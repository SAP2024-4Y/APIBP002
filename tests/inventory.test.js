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

test('REST: products expose an integer inventory', async () => {
  const res = await request(app).get('/api/v1/products?limit=100');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((p) => Number.isInteger(p.inventory)));
  assert.ok(res.body.data.every((p) => (p.status === 'out_of_stock' ? p.inventory === 0 : true)));
});

test('GraphQL: Product.inventory resolves', async () => {
  const res = await request(app)
    .post('/graphql')
    .send({ query: '{ products(first:3){ edges{ node{ id inventory status } } } }' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.products.edges.every((e) => Number.isInteger(e.node.inventory)));
});
