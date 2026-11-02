const { pool } = require('./db');

async function findAllRooms(db = pool) {
  const { rows } = await db.query('SELECT id, name, capacity FROM rooms ORDER BY id');
  return rows;
}

async function findRoomById(id, db = pool) {
  const { rows } = await db.query('SELECT id, name, capacity FROM rooms WHERE id = $1', [id]);
  return rows[0] || null;
}

module.exports = { findAllRooms, findRoomById };
