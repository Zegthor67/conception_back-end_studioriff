const { validateSlot } = require('../../src/domain/booking');
const { ValidationError } = require('../../src/domain/errors');
const { fixedClock } = require('../helpers');

const now = fixedClock.now();
const slot = (start, end) => () => validateSlot(new Date(start), new Date(end), now);

test('accepte un créneau de 2 h dans les horaires', () => {
  expect(slot('2026-11-04T14:00:00Z', '2026-11-04T16:00:00Z')).not.toThrow();
});

test('accepte les bornes : 10 h - 11 h et 19 h - 23 h', () => {
  expect(slot('2026-11-04T10:00:00Z', '2026-11-04T11:00:00Z')).not.toThrow();
  expect(slot('2026-11-04T19:00:00Z', '2026-11-04T23:00:00Z')).not.toThrow();
});

test('refuse un début qui ne tombe pas sur une heure pile', () => {
  expect(slot('2026-11-04T14:30:00Z', '2026-11-04T16:30:00Z')).toThrow(ValidationError);
});

test('refuse une durée de moins de 1 h ou de plus de 4 h', () => {
  expect(slot('2026-11-04T14:00:00Z', '2026-11-04T14:00:00Z')).toThrow(ValidationError);
  expect(slot('2026-11-04T12:00:00Z', '2026-11-04T17:00:00Z')).toThrow(ValidationError);
});

test('refuse une fin avant le début', () => {
  expect(slot('2026-11-04T16:00:00Z', '2026-11-04T14:00:00Z')).toThrow(ValidationError);
});

test('refuse un début avant 10 h', () => {
  expect(slot('2026-11-04T09:00:00Z', '2026-11-04T11:00:00Z')).toThrow(ValidationError);
});

test('refuse une fin après 23 h, y compris le lendemain', () => {
  expect(slot('2026-11-04T22:00:00Z', '2026-11-05T00:00:00Z')).toThrow(ValidationError);
  expect(slot('2026-11-04T22:00:00Z', '2026-11-05T02:00:00Z')).toThrow(ValidationError);
});

test('refuse un créneau qui commence dans le passé', () => {
  expect(slot('2026-11-01T14:00:00Z', '2026-11-01T16:00:00Z')).toThrow(ValidationError);
});
