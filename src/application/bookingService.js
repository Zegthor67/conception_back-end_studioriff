const crypto = require('crypto');
const { NotFoundError, ValidationError } = require('../domain/errors');
const { parseUtcDate } = require('../domain/dates');
const { validateSlot, checkNoOverlap, checkMemberLimit, cancelBooking } = require('../domain/booking');
const { pool } = require('../infrastructure/db');
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

async function bookRoom(roomId, body, clock) {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new NotFoundError('Salle introuvable');

  const { memberId, start: startParam, end: endParam } = body || {};
  if (typeof memberId !== 'string') throw new ValidationError('memberId est obligatoire');
  const start = parseUtcDate(startParam, 'start');
  const end = parseUtcDate(endParam, 'end');

  validateSlot(start, end, clock.now());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const member = await memberRepository.lockMemberById(memberId, client);
    if (!member) throw new ValidationError('memberId inconnu');

    const memberBookings = await bookingRepository.findBookingsByMember(memberId, client);
    checkMemberLimit(memberBookings, clock.now());

    const roomBookings = await bookingRepository.findRoomSchedule(roomId, start, end, client);
    checkNoOverlap(roomBookings, start, end);

    const booking = await bookingRepository.insertBooking(
      { id: crypto.randomUUID(), roomId, memberId, start, end, status: 'confirmed' },
      client
    );

    await client.query('COMMIT');
    return booking;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function cancel(bookingId, clock) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const booking = await bookingRepository.lockBookingById(bookingId, client);
    if (!booking) throw new NotFoundError('Réservation introuvable');

    const now = clock.now();
    const status = cancelBooking(booking, now);
    const cancelled = await bookingRepository.updateBookingStatus(bookingId, status, now, client);

    await client.query('COMMIT');
    return cancelled;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listRooms, getRoomSchedule, getBooking, listMemberBookings, bookRoom, cancel };
