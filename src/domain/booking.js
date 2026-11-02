const { ValidationError, ConflictError } = require('./errors');

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

// Fin exclue : 18h-20h et 20h-22h ne se chevauchent pas
function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function checkNoOverlap(roomBookings, start, end) {
  const conflict = roomBookings.some(
    (b) => b.status === 'confirmed' && overlaps(b.start, b.end, start, end)
  );
  if (conflict) {
    throw new ConflictError('La salle est déjà réservée sur ce créneau');
  }
}

const MAX_UPCOMING_BOOKINGS = 2;

function checkMemberLimit(memberBookings, now) {
  const upcoming = memberBookings.filter((b) => b.status === 'confirmed' && b.start > now);
  if (upcoming.length >= MAX_UPCOMING_BOOKINGS) {
    throw new ConflictError('Ce membre a déjà 2 réservations à venir');
  }
}

const LATE_CANCEL_DELAY = 24 * HOUR;

function cancelBooking(booking, now) {
  if (booking.status !== 'confirmed') {
    throw new ConflictError('Cette réservation est déjà annulée');
  }
  if (booking.start <= now) {
    throw new ConflictError('Cette réservation a déjà commencé');
  }
  return booking.start - now < LATE_CANCEL_DELAY ? 'late_cancelled' : 'cancelled';
}

module.exports = { validateSlot, overlaps, checkNoOverlap, checkMemberLimit, cancelBooking };
