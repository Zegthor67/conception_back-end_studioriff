// Valkey injoignable : on pointe vers un port où rien n'écoute, avant de charger l'application
process.env.VALKEY_URL = 'redis://localhost:6390';

const request = require('supertest');
const { createApp } = require('../../src/http/app');
const { fixedClock, resetData, closeAll } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => resetData());
afterAll(() => closeAll());

test('le planning répond depuis PostgreSQL quand Valkey est indisponible', async () => {
  const res = await request(app).get('/rooms/room-1/bookings');
  expect(res.status).toBe(200);
  expect(res.body.map((b) => b.id)).toEqual(['booking-1']);
});

test('réserver et annuler fonctionnent quand Valkey est indisponible', async () => {
  const created = await request(app)
    .post('/rooms/room-1/bookings')
    .send({ memberId: 'member-3', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' });
  expect(created.status).toBe(201);

  const cancelled = await request(app).delete(`/bookings/${created.body.id}`);
  expect(cancelled.status).toBe(204);
});
