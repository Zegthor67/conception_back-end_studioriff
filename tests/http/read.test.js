const request = require('supertest');
const { createApp } = require('../../src/http/app');
const { pool } = require('../../src/infrastructure/db');
const { seed } = require('../../scripts/seed');
const { fixedClock } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => seed());
afterAll(() => pool.end());

test('GET /rooms renvoie les 4 salles', async () => {
  const res = await request(app).get('/rooms');
  expect(res.status).toBe(200);
  expect(res.body.map((r) => r.id)).toEqual(['room-1', 'room-2', 'room-3', 'room-4']);
});

test('GET /bookings/:id renvoie la réservation au format du contrat', async () => {
  const res = await request(app).get('/bookings/booking-1');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    id: 'booking-1',
    roomId: 'room-1',
    memberId: 'member-1',
    start: '2026-11-03T18:00:00Z',
    end: '2026-11-03T20:00:00Z',
    status: 'confirmed',
  });
});

test('GET /bookings/:id renvoie 404 si la réservation est inconnue', async () => {
  const res = await request(app).get('/bookings/booking-999');
  expect(res.status).toBe(404);
});

test('GET /rooms/:id/bookings renvoie le planning de la période', async () => {
  const res = await request(app).get('/rooms/room-2/bookings?from=2026-11-02T00:00:00Z&to=2026-11-09T00:00:00Z');
  expect(res.status).toBe(200);
  expect(res.body.map((b) => b.id)).toEqual(['booking-3']);
});

test('GET /rooms/:id/bookings prend les 7 prochains jours par défaut', async () => {
  const res = await request(app).get('/rooms/room-1/bookings');
  expect(res.status).toBe(200);
  expect(res.body.map((b) => b.id)).toEqual(['booking-1']);
});

test('GET /rooms/:id/bookings renvoie 404 si la salle est inconnue', async () => {
  const res = await request(app).get('/rooms/room-9/bookings');
  expect(res.status).toBe(404);
});

test('GET /members/:id/bookings renvoie les réservations du membre', async () => {
  const res = await request(app).get('/members/member-1/bookings');
  expect(res.status).toBe(200);
  expect(res.body.map((b) => b.id)).toEqual(['booking-1', 'booking-2']);
});

test('GET /members/:id/bookings renvoie 404 si le membre est inconnu', async () => {
  const res = await request(app).get('/members/member-9/bookings');
  expect(res.status).toBe(404);
});
