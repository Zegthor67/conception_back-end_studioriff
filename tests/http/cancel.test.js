const request = require('supertest');
const { createApp } = require('../../src/http/app');
const { fixedClock, resetData, closeAll } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => resetData());
afterAll(() => closeAll());

test('DELETE renvoie 204 et la réservation reste enregistrée en cancelled', async () => {
  const res = await request(app).delete('/bookings/booking-1');
  expect(res.status).toBe(204);

  const saved = await request(app).get('/bookings/booking-1');
  expect(saved.status).toBe(200);
  expect(saved.body.status).toBe('cancelled');
});

test('DELETE à moins de 24 h passe la réservation en late_cancelled', async () => {
  await request(app).delete('/bookings/booking-3');

  const saved = await request(app).get('/bookings/booking-3');
  expect(saved.body.status).toBe('late_cancelled');
});

test('DELETE renvoie 409 si la réservation est déjà annulée', async () => {
  await request(app).delete('/bookings/booking-1');
  const res = await request(app).delete('/bookings/booking-1');
  expect(res.status).toBe(409);
});

test('DELETE renvoie 409 pour une réservation passée', async () => {
  const res = await request(app).delete('/bookings/booking-4');
  expect(res.status).toBe(409);
});

test('DELETE renvoie 404 si la réservation est inconnue', async () => {
  const res = await request(app).delete('/bookings/booking-999');
  expect(res.status).toBe(404);
});

test('deux DELETE simultanés : un seul passe', async () => {
  const responses = await Promise.all([
    request(app).delete('/bookings/booking-1'),
    request(app).delete('/bookings/booking-1'),
  ]);

  const statuses = responses.map((r) => r.status).sort();
  expect(statuses).toEqual([204, 409]);
});

test('après annulation, member-1 peut de nouveau réserver', async () => {
  await request(app).delete('/bookings/booking-1');

  const res = await request(app)
    .post('/rooms/room-1/bookings')
    .send({ memberId: 'member-1', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' });
  expect(res.status).toBe(201);
});
