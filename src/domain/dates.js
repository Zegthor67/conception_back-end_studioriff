const { ValidationError } = require('./errors');

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function parseUtcDate(value, field) {
  if (typeof value !== 'string' || !ISO_UTC.test(value) || isNaN(new Date(value))) {
    throw new ValidationError(`${field} doit être une date ISO en UTC, par exemple 2026-11-04T14:00:00Z`);
  }
  return new Date(value);
}

function toUtcString(date) {
  return date.toISOString().replace('.000Z', 'Z');
}

module.exports = { parseUtcDate, toUtcString };
