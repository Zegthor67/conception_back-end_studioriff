const { cancelBooking } = require('../../src/domain/booking');
const { ConflictError } = require('../../src/domain/errors');
const { fixedClock } = require('../helpers');

const now = fixedClock.now();

const booking = (start, status = 'confirmed') => ({ start: new Date(start), status });

test('cancelled si le créneau commence dans plus de 24 h', () => {
  expect(cancelBooking(booking('2026-11-03T18:00:00Z'), now)).toBe('cancelled');
});

test('late_cancelled si le créneau commence dans moins de 24 h (booking-3)', () => {
  expect(cancelBooking(booking('2026-11-02T19:00:00Z'), now)).toBe('late_cancelled');
});

test('cancelled si le créneau commence exactement dans 24 h', () => {
  expect(cancelBooking(booking('2026-11-03T09:00:00Z'), now)).toBe('cancelled');
});

test('refuse d\'annuler une réservation déjà annulée', () => {
  expect(() => cancelBooking(booking('2026-11-03T18:00:00Z', 'cancelled'), now)).toThrow(ConflictError);
  expect(() => cancelBooking(booking('2026-11-02T19:00:00Z', 'late_cancelled'), now)).toThrow(ConflictError);
});

test('refuse d\'annuler une réservation déjà commencée ou passée', () => {
  expect(() => cancelBooking(booking('2026-11-02T09:00:00Z'), now)).toThrow(ConflictError);
  expect(() => cancelBooking(booking('2026-10-28T19:00:00Z'), now)).toThrow(ConflictError);
});
