'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '5000';

const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { buildApp } = require('../src/app');

let app;
let token;

async function gql(query, variables, bearer) {
  const req = request(app).post('/graphql').send({ query, variables });
  if (bearer) req.set('Authorization', `Bearer ${bearer}`);
  return req;
}

before(async () => {
  ({ app } = await buildApp());
  const res = await gql(
    'mutation($u:String!,$p:String!){ requestToken(username:$u,password:$p){ token tokenType } }',
    { u: 'demo', p: 'demo-password' }
  );
  token = res.body.data.requestToken.token;
});

test('GraphQL: requestToken mutation returns a Bearer token', () => {
  assert.ok(token && token.length > 10);
});

test('GraphQL: products connection exposes edges, pageInfo, totalCount', async () => {
  const res = await gql(`{
    products(first: 3, sort: ID, order: ASC) {
      totalCount
      edges { cursor node { id name price priceInPaise status location { coordinates } } }
      pageInfo { hasNextPage endCursor }
    }
  }`);
  assert.strictEqual(res.status, 200);
  const conn = res.body.data.products;
  assert.strictEqual(conn.edges.length, 3);
  assert.ok(conn.totalCount >= 20);
  assert.strictEqual(conn.pageInfo.hasNextPage, true);
  // deprecated `price` and authoritative `priceInPaise` both resolve
  assert.strictEqual(conn.edges[0].node.priceInPaise, Math.round(conn.edges[0].node.price * 100));
  assert.strictEqual(conn.edges[0].node.location.coordinates.length, 2);
});

test('GraphQL: cursor pagination is consistent with the connection cursor', async () => {
  const page1 = await gql('{ products(first:2, sort: ID, order: ASC){ edges{ node{ id } } pageInfo{ endCursor hasNextPage } } }');
  const cursor = page1.body.data.products.pageInfo.endCursor;
  const page2 = await gql(
    'query($c:String){ products(first:2, after:$c, sort: ID, order: ASC){ edges{ node{ id } } } }',
    { c: cursor }
  );
  const ids1 = page1.body.data.products.edges.map((e) => e.node.id);
  const ids2 = page2.body.data.products.edges.map((e) => e.node.id);
  for (const id of ids2) assert.ok(!ids1.includes(id));
});

test('GraphQL: productsNear returns hits with distanceKm', async () => {
  const res = await gql(`{
    productsNear(latitude: 12.9716, longitude: 77.5946, radiusKm: 50) {
      distanceKm product { id category }
    }
  }`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.productsNear.length > 0);
  assert.ok(typeof res.body.data.productsNear[0].distanceKm === 'number');
});

test('GraphQL: DataLoader resolves nested slots for many products', async () => {
  const res = await gql('{ products(first:5){ edges{ node{ id slots { id startsAt } } } } }');
  assert.strictEqual(res.status, 200);
  const nodes = res.body.data.products.edges.map((e) => e.node);
  assert.ok(nodes.some((n) => n.slots.length > 0));
});

test('GraphQL: unknown product resolves to null (not an error)', async () => {
  const res = await gql('{ product(id:"nope"){ id } }');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.product, null);
});

test('GraphQL: bookSlot without auth yields UNAUTHENTICATED extension', async () => {
  const res = await gql('mutation{ bookSlot(slotId:"slot_010_1"){ id } }');
  assert.ok(res.body.errors);
  assert.strictEqual(res.body.errors[0].extensions.code, 'UNAUTHENTICATED');
});

test('GraphQL: error parity — full slot yields SLOT_FULL extension (same code as REST)', async () => {
  const res = await gql('mutation{ bookSlot(slotId:"slot_full_demo"){ id } }', undefined, token);
  assert.ok(res.body.errors);
  assert.strictEqual(res.body.errors[0].extensions.code, 'SLOT_FULL');
});
