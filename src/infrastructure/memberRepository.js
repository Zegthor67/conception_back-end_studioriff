const { pool } = require('./db');

async function findMemberById(id, db = pool) {
  const { rows } = await db.query('SELECT id, name FROM members WHERE id = $1', [id]);
  return rows[0] || null;
}

module.exports = { findMemberById };
