const { checkNoOverlap } = require('../../src/domain/booking');
const { ConflictError } = require('../../src/domain/errors');

const existing = [
  {
    start: new Date('2026-11-03T18:00:00Z'),
    end: new Date('2026-11-03T20:00:00Z'),
    status: 'confirmed',
  },
];

const check = (bookings, start, end) => () => checkNoOverlap(bookings, new Date(start), new Date(end));

test('refuse un créneau qui chevauche une réservation confirmée', () => {
  expect(check(existing, '2026-11-03T19:00:00Z', '2026-11-03T21:00:00Z')).toThrow(ConflictError);
  expect(check(existing, '2026-11-03T17:00:00Z', '2026-11-03T19:00:00Z')).toThrow(ConflictError);
  expect(check(existing, '2026-11-03T18:00:00Z', '2026-11-03T20:00:00Z')).toThrow(ConflictError);
});

test('accepte un créneau qui commence pile à la fin du précédent', () => {
  expect(check(existing, '2026-11-03T20:00:00Z', '2026-11-03T22:00:00Z')).not.toThrow();
});

test('accepte un créneau qui finit pile au début du suivant', () => {
  expect(check(existing, '2026-11-03T16:00:00Z', '2026-11-03T18:00:00Z')).not.toThrow();
});

test('ignore une réservation annulée', () => {
  const cancelled = [{ ...existing[0], status: 'cancelled' }];
  expect(check(cancelled, '2026-11-03T19:00:00Z', '2026-11-03T21:00:00Z')).not.toThrow();
});
