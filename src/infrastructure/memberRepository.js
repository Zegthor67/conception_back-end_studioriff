const { pool } = require('./db');

async function findMemberById(id, db = pool) {
  const { rows } = await db.query('SELECT id, name FROM members WHERE id = $1', [id]);
  return rows[0] || null;
}

// À appeler dans une transaction : les autres requêtes du même membre attendent le COMMIT
async function lockMemberById(id, db) {
  const { rows } = await db.query('SELECT id, name FROM members WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

module.exports = { findMemberById, lockMemberById };
