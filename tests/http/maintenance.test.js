const request = require('supertest');
const { createApp } = require('../../src/http/app');
const { pool } = require('../../src/infrastructure/db');
const { seed } = require('../../scripts/seed');
const { fixedClock } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => seed());
afterAll(() => pool.end());

const post = (roomId, start, end) =>
  request(app).post(`/rooms/${roomId}/bookings`).send({ memberId: 'member-3', start, end });

test('POST renvoie 409 sur la salle Björk pendant sa maintenance', async () => {
  const res = await post('room-4', '2026-11-05T14:00:00Z', '2026-11-05T16:00:00Z');
  expect(res.status).toBe(409);
});

test('POST accepte la salle Björk la veille de la maintenance', async () => {
  const res = await post('room-4', '2026-11-04T21:00:00Z', '2026-11-04T23:00:00Z');
  expect(res.status).toBe(201);
});

test('POST accepte une autre salle pendant la maintenance de Björk', async () => {
  const res = await post('room-1', '2026-11-05T14:00:00Z', '2026-11-05T16:00:00Z');
  expect(res.status).toBe(201);
});
