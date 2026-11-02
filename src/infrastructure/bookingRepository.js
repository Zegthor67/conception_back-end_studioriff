const { pool } = require('./db');
const { ConflictError } = require('../domain/errors');

const COLUMNS = 'id, room_id, member_id, start_at, end_at, status';

function toBooking(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    memberId: row.member_id,
    start: row.start_at,
    end: row.end_at,
    status: row.status,
  };
}

async function findBookingById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM bookings WHERE id = $1`, [id]);
  return rows[0] ? toBooking(rows[0]) : null;
}

async function findBookingsByMember(memberId, db = pool) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM bookings WHERE member_id = $1 ORDER BY start_at`,
    [memberId]
  );
  return rows.map(toBooking);
}

async function findRoomSchedule(roomId, from, to, db = pool) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM bookings
     WHERE room_id = $1 AND status = 'confirmed' AND start_at < $3 AND end_at > $2
     ORDER BY start_at`,
    [roomId, from, to]
  );
  return rows.map(toBooking);
}

const EXCLUSION_VIOLATION = '23P01';

async function insertBooking(booking, db = pool) {
  try {
    const { rows } = await db.query(
      `INSERT INTO bookings (id, room_id, member_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [booking.id, booking.roomId, booking.memberId, booking.start, booking.end, booking.status]
    );
    return toBooking(rows[0]);
  } catch (err) {
    if (err.code === EXCLUSION_VIOLATION) {
      throw new ConflictError('La salle est déjà réservée sur ce créneau');
    }
    throw err;
  }
}

module.exports = { findBookingById, findBookingsByMember, findRoomSchedule, insertBooking };
