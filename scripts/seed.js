const fs = require('fs');
const path = require('path');
const { pool } = require('../src/infrastructure/db');

const SEED_SQL = fs.readFileSync(path.join(__dirname, '..', 'seeds', 'seed.sql'), 'utf8');

async function seed() {
  await pool.query(SEED_SQL);
}

if (require.main === module) {
  seed()
    .then(() => console.log('Données de départ insérées'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { seed };
