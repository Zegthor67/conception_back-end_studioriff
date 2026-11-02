const { pool } = require('./db');

async function findAllRooms(db = pool) {
  const { rows } = await db.query('SELECT id, name, capacity FROM rooms ORDER BY id');
  return rows;
}

async function findRoomById(id, db = pool) {
  const { rows } = await db.query('SELECT id, name, capacity FROM rooms WHERE id = $1', [id]);
  return rows[0] || null;
}

async function findMaintenancesByRoom(roomId, db = pool) {
  const { rows } = await db.query(
    'SELECT starts_at, ends_at FROM room_maintenances WHERE room_id = $1',
    [roomId]
  );
  return rows.map((row) => ({ start: row.starts_at, end: row.ends_at }));
}

module.exports = { findAllRooms, findRoomById, findMaintenancesByRoom };
