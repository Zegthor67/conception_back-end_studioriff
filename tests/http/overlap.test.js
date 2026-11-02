const request = require('supertest');
const { createApp } = require('../../src/http/app');
const { pool } = require('../../src/infrastructure/db');
const { fixedClock, resetData, closeAll } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => resetData());
afterAll(() => closeAll());

// booking-1 : room-1, le 3 novembre de 18h à 20h
const post = (body) => request(app).post('/rooms/room-1/bookings').send(body);

test('POST renvoie 409 si le créneau chevauche une réservation', async () => {
  const res = await post({ memberId: 'member-3', start: '2026-11-03T19:00:00Z', end: '2026-11-03T21:00:00Z' });
  expect(res.status).toBe(409);
});

test('POST accepte un créneau qui commence pile à la fin du précédent', async () => {
  const res = await post({ memberId: 'member-3', start: '2026-11-03T20:00:00Z', end: '2026-11-03T22:00:00Z' });
  expect(res.status).toBe(201);
});

test('POST accepte un créneau libéré par une annulation', async () => {
  await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = 'booking-1'");
  const res = await post({ memberId: 'member-3', start: '2026-11-03T19:00:00Z', end: '2026-11-03T21:00:00Z' });
  expect(res.status).toBe(201);
});

test('deux POST simultanés sur le même créneau : un seul passe', async () => {
  const slot = { start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' };
  const responses = await Promise.all([
    post({ memberId: 'member-2', ...slot }),
    post({ memberId: 'member-3', ...slot }),
  ]);

  const statuses = responses.map((r) => r.status).sort();
  expect(statuses).toEqual([201, 409]);
});

test('la base refuse elle-même un chevauchement inséré en SQL', async () => {
  await expect(
    pool.query(
      `INSERT INTO bookings (id, room_id, member_id, start_at, end_at)
       VALUES ('sql-test', 'room-1', 'member-3', '2026-11-03 19:00+00', '2026-11-03 21:00+00')`
    )
  ).rejects.toMatchObject({ code: '23P01' });
});
