const { checkMemberLimit } = require('../../src/domain/booking');
const { ConflictError } = require('../../src/domain/errors');
const { fixedClock } = require('../helpers');

const now = fixedClock.now();

const booking = (start, status = 'confirmed') => ({ start: new Date(start), status });

test('refuse un membre qui a déjà 2 réservations à venir', () => {
  const bookings = [booking('2026-11-03T18:00:00Z'), booking('2026-11-10T14:00:00Z')];
  expect(() => checkMemberLimit(bookings, now)).toThrow(ConflictError);
});

test('accepte un membre qui a 1 seule réservation à venir', () => {
  const bookings = [booking('2026-11-03T18:00:00Z')];
  expect(() => checkMemberLimit(bookings, now)).not.toThrow();
});

test('ne compte pas les réservations passées', () => {
  const bookings = [booking('2026-10-28T19:00:00Z'), booking('2026-11-02T19:00:00Z')];
  expect(() => checkMemberLimit(bookings, now)).not.toThrow();
});

test('ne compte pas les réservations annulées', () => {
  const bookings = [booking('2026-11-03T18:00:00Z'), booking('2026-11-10T14:00:00Z', 'cancelled')];
  expect(() => checkMemberLimit(bookings, now)).not.toThrow();
});

test('le résultat dépend de l\'horloge reçue', () => {
  const bookings = [booking('2026-11-03T18:00:00Z'), booking('2026-11-10T14:00:00Z')];
  const later = new Date('2026-11-04T09:00:00Z');
  expect(() => checkMemberLimit(bookings, later)).not.toThrow();
});
