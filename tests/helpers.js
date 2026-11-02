const { pool } = require('../src/infrastructure/db');
const cache = require('../src/infrastructure/cache');
const { seed } = require('../scripts/seed');

const fixedClock = {
  now: () => new Date('2026-11-02T09:00:00Z'),
};

// Données de départ + cache vide, sinon un planning mis en cache par un test précédent resterait
async function resetData() {
  await seed();
  await cache.clear();
}

async function closeAll() {
  await pool.end();
  cache.close();
}

module.exports = { fixedClock, resetData, closeAll };
