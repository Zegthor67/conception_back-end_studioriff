const request = require('supertest');
const { createApp } = require('../../src/http/app');
const cache = require('../../src/infrastructure/cache');
const { fixedClock, resetData, closeAll } = require('../helpers');

const app = createApp({ clock: fixedClock });

beforeEach(() => resetData());
afterAll(() => closeAll());

const schedule = () => request(app).get('/rooms/room-1/bookings');
const ids = (res) => res.body.map((b) => b.id);

test('le planning est mis en cache dans Valkey après une première lecture', async () => {
  expect(await cache.client.exists('schedule:room-1')).toBe(0);

  const first = await schedule();
  expect(await cache.client.exists('schedule:room-1')).toBe(1);

  const second = await schedule();
  expect(second.body).toEqual(first.body);
});

test('la clé expire au bout de 5 minutes au maximum', async () => {
  await schedule();
  const ttl = await cache.client.ttl('schedule:room-1');
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(300);
});

test('une nouvelle réservation apparaît tout de suite dans le planning', async () => {
  await schedule();

  const created = await request(app)
    .post('/rooms/room-1/bookings')
    .send({ memberId: 'member-3', start: '2026-11-04T14:00:00Z', end: '2026-11-04T16:00:00Z' });

  const res = await schedule();
  expect(ids(res)).toEqual(['booking-1', created.body.id]);
});

test('une annulation disparaît tout de suite du planning', async () => {
  const before = await schedule();
  expect(ids(before)).toEqual(['booking-1']);

  await request(app).delete('/bookings/booking-1');

  const after = await schedule();
  expect(ids(after)).toEqual([]);
});
