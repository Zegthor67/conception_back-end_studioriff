const { NotFoundError, ValidationError } = require('../domain/errors');
const { parseUtcDate } = require('../domain/dates');
const roomRepository = require('../infrastructure/roomRepository');
const memberRepository = require('../infrastructure/memberRepository');
const bookingRepository = require('../infrastructure/bookingRepository');

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

async function listRooms() {
  return roomRepository.findAllRooms();
}

async function getRoomSchedule(roomId, fromParam, toParam, clock) {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new NotFoundError('Salle introuvable');

  const from = fromParam ? parseUtcDate(fromParam, 'from') : clock.now();
  const to = toParam ? parseUtcDate(toParam, 'to') : new Date(from.getTime() + SEVEN_DAYS);
  if (to <= from) throw new ValidationError('to doit être après from');

  return bookingRepository.findRoomSchedule(roomId, from, to);
}

async function getBooking(id) {
  const booking = await bookingRepository.findBookingById(id);
  if (!booking) throw new NotFoundError('Réservation introuvable');
  return booking;
}

async function listMemberBookings(memberId) {
  const member = await memberRepository.findMemberById(memberId);
  if (!member) throw new NotFoundError('Membre introuvable');
  return bookingRepository.findBookingsByMember(memberId);
}

module.exports = { listRooms, getRoomSchedule, getBooking, listMemberBookings };
