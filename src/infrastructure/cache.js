require('dotenv').config({ quiet: true });
const Redis = require('ioredis');

const SCHEDULE_TTL_SECONDS = 5 * 60;
const TIMEOUT_MS = 200;

const client = new Redis(process.env.VALKEY_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
});
client.on('error', () => {});

// Si Valkey ne répond pas en 200 ms, on le considère comme indisponible
function withTimeout(promise) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Valkey ne répond pas')), TIMEOUT_MS).unref();
  });
  return Promise.race([promise, timeout]);
}

const scheduleKey = (roomId) => `schedule:${roomId}`;
const periodField = (from, to) => `${from.toISOString()}|${to.toISOString()}`;

async function getSchedule(roomId, from, to) {
  try {
    const value = await withTimeout(client.hget(scheduleKey(roomId), periodField(from, to)));
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function setSchedule(roomId, from, to, bookings) {
  try {
    await withTimeout(
      client
        .multi()
        .hset(scheduleKey(roomId), periodField(from, to), JSON.stringify(bookings))
        .expire(scheduleKey(roomId), SCHEDULE_TTL_SECONDS)
        .exec()
    );
  } catch {
    // Valkey indisponible : on ne met simplement pas en cache
  }
}

async function invalidateSchedule(roomId) {
  try {
    await withTimeout(client.del(scheduleKey(roomId)));
  } catch {
    // Valkey indisponible : rien à invalider
  }
}

async function clear() {
  try {
    await withTimeout(client.flushdb());
  } catch {
    // Valkey indisponible
  }
}

function close() {
  client.disconnect();
}

module.exports = { client, getSchedule, setSchedule, invalidateSchedule, clear, close };
