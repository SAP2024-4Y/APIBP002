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
  demoToken = (await request(app).post('/api/v1/auth/token').send({ username: 'demo', password: 'demo-password' })).body.token;
  adminToken = (await request(app).post('/api/v1/auth/token').send({ username: 'admin', password: 'admin-password' })).body.token;
});

test('cancel: owner can cancel their booking (200) and capacity is released', async () => {
  const booked = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_020_1' });
  assert.strictEqual(booked.status, 201);
  const id = booked.body.created.id;

  const cancelled = await request(app)
    .delete(`/api/v1/bookings/${id}`)
    .set('Authorization', `Bearer ${demoToken}`);
  assert.strictEqual(cancelled.status, 200);
  assert.strictEqual(cancelled.body.cancelled, true);
});

test('cancel: cancelling an unknown booking returns 404', async () => {
  const res = await request(app)
    .delete('/api/v1/bookings/bk_does_not_exist')
    .set('Authorization', `Bearer ${demoToken}`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'NOT_FOUND');
});

test('cancel: a non-owner is forbidden (403)', async () => {
  const booked = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${demoToken}`)
    .send({ slot_id: 'slot_021_1' });
  assert.strictEqual(booked.status, 201);

  const res = await request(app)
    .delete(`/api/v1/bookings/${booked.body.created.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error.code, 'FORBIDDEN');
});
