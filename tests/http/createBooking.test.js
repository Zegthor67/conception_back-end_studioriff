const request = require('supertest');
const { createApp } = require('../../src/http/app');
const { pool } = require('../../src/infrastructure/db');
const { seed } = require('../../scripts/seed');
const { fixedClock } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => seed());
afterAll(() => pool.end());

const body = { memberId: 'member-3', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' };

test('POST crée la réservation : 201, Location et corps au format du contrat', async () => {
  const res = await request(app).post('/rooms/room-1/bookings').send(body);

  expect(res.status).toBe(201);
  expect(res.headers.location).toBe(`/bookings/${res.body.id}`);
  expect(res.body).toEqual({ id: res.body.id, roomId: 'room-1', ...body, status: 'confirmed' });

  const saved = await request(app).get(res.headers.location);
  expect(saved.status).toBe(200);
});

test('POST renvoie 400 pour un créneau invalide', async () => {
  const res = await request(app)
    .post('/rooms/room-1/bookings')
    .send({ ...body, start: '2026-11-04T14:30:00Z' });
  expect(res.status).toBe(400);
});

test('POST renvoie 400 pour une date qui n\'est pas en UTC', async () => {
  const res = await request(app)
    .post('/rooms/room-1/bookings')
    .send({ ...body, start: '2026-11-04T14:00:00+01:00' });
  expect(res.status).toBe(400);
});

test('POST renvoie 400 si un champ manque', async () => {
  const res = await request(app).post('/rooms/room-1/bookings').send({ start: body.start, end: body.end });
  expect(res.status).toBe(400);
});

test('POST renvoie 400 si le membre est inconnu', async () => {
  const res = await request(app)
    .post('/rooms/room-1/bookings')
    .send({ ...body, memberId: 'member-9' });
  expect(res.status).toBe(400);
});

test('POST renvoie 404 si la salle est inconnue', async () => {
  const res = await request(app).post('/rooms/room-9/bookings').send(body);
  expect(res.status).toBe(404);
});
