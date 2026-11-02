const { ValidationError } = require('./errors');

const HOUR = 60 * 60 * 1000;
const OPENING_HOUR = 10;
const CLOSING_HOUR = 23;

function validateSlot(start, end, now) {
  if (start.getUTCMinutes() !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    throw new ValidationError('Le créneau doit commencer à une heure pile');
  }

  const hours = (end - start) / HOUR;
  if (!Number.isInteger(hours) || hours < 1 || hours > 4) {
    throw new ValidationError('Un créneau dure 1, 2, 3 ou 4 heures');
  }

  if (start.getUTCHours() < OPENING_HOUR) {
    throw new ValidationError('Le créneau commence au plus tôt à 10 h');
  }

  const closing = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), CLOSING_HOUR));
  if (end > closing) {
    throw new ValidationError('Le créneau se termine au plus tard à 23 h le même jour');
  }

  if (start < now) {
    throw new ValidationError('Le créneau ne peut pas commencer dans le passé');
  }
}

module.exports = { validateSlot };
