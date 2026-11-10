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

function gql(query, variables, bearer) {
  const r = request(app).post('/graphql').send({ query, variables });
  if (bearer) r.set('Authorization', `Bearer ${bearer}`);
  return r;
}

before(async () => {
  ({ app } = await buildApp());
  demoToken = (await request(app).post('/api/v1/auth/token').send({ username: 'demo', password: 'demo-password' })).body.token;
  adminToken = (await request(app).post('/api/v1/auth/token').send({ username: 'admin', password: 'admin-password' })).body.token;
});

test('GraphQL cancelBooking without auth -> UNAUTHENTICATED', async () => {
  const res = await gql('mutation{ cancelBooking(bookingId:"bk_x"){ cancelled } }');
  assert.strictEqual(res.body.errors[0].extensions.code, 'UNAUTHENTICATED');
});

test('GraphQL cancelBooking cancels an owned booking', async () => {
  const booked = await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${demoToken}`).send({ slot_id: 'slot_012_1' });
  const id = booked.body.created.id;
  const res = await gql('mutation($id:ID!){ cancelBooking(bookingId:$id){ id cancelled } }', { id }, demoToken);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.cancelBooking.cancelled, true);
});

test('GraphQL cancelBooking by a non-owner -> FORBIDDEN', async () => {
  const booked = await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${demoToken}`).send({ slot_id: 'slot_013_1' });
  const res = await gql('mutation($id:ID!){ cancelBooking(bookingId:$id){ cancelled } }', { id: booked.body.created.id }, adminToken);
  assert.strictEqual(res.body.errors[0].extensions.code, 'FORBIDDEN');
});
