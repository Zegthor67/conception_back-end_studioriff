const request = require('supertest');
const { createApp } = require('../../src/http/app');
const { pool } = require('../../src/infrastructure/db');
const { seed } = require('../../scripts/seed');
const { fixedClock } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => seed());
afterAll(() => pool.end());

const post = (roomId, body) => request(app).post(`/rooms/${roomId}/bookings`).send(body);

test('POST renvoie 409 pour member-1 qui a déjà 2 réservations à venir', async () => {
  const res = await post('room-1', { memberId: 'member-1', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' });
  expect(res.status).toBe(409);
});

test('member-2 (1 réservation à venir) peut en ajouter une, mais pas deux', async () => {
  const first = await post('room-1', { memberId: 'member-2', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' });
  expect(first.status).toBe(201);

  const second = await post('room-3', { memberId: 'member-2', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' });
  expect(second.status).toBe(409);
});

test('deux POST simultanés du même membre : un seul passe', async () => {
  const responses = await Promise.all([
    post('room-1', { memberId: 'member-2', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' }),
    post('room-3', { memberId: 'member-2', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' }),
  ]);

  const statuses = responses.map((r) => r.status).sort();
  expect(statuses).toEqual([201, 409]);
});
