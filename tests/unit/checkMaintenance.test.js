const { checkMaintenance } = require('../../src/domain/booking');
const { ConflictError } = require('../../src/domain/errors');

// Maintenance de la salle Björk
const maintenances = [
  { start: new Date('2026-11-05T00:00:00Z'), end: new Date('2026-11-08T00:00:00Z') },
];

const check = (start, end) => () => checkMaintenance(maintenances, new Date(start), new Date(end));

test('refuse un créneau pendant la maintenance', () => {
  expect(check('2026-11-05T14:00:00Z', '2026-11-05T16:00:00Z')).toThrow(ConflictError);
  expect(check('2026-11-07T19:00:00Z', '2026-11-07T23:00:00Z')).toThrow(ConflictError);
});

test('accepte un créneau la veille de la maintenance', () => {
  expect(check('2026-11-04T21:00:00Z', '2026-11-04T23:00:00Z')).not.toThrow();
});

test('accepte un créneau le jour de la fin de la maintenance', () => {
  expect(check('2026-11-08T10:00:00Z', '2026-11-08T12:00:00Z')).not.toThrow();
});

test('accepte tout créneau si la salle n\'a pas de maintenance', () => {
  expect(() =>
    checkMaintenance([], new Date('2026-11-05T14:00:00Z'), new Date('2026-11-05T16:00:00Z'))
  ).not.toThrow();
});
