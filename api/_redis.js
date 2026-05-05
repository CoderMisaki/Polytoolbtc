const REDIS_URL = process.env.DB_KV_REST_API_URL;
const REDIS_TOKEN = process.env.DB_KV_REST_API_TOKEN;

async function redisCommand(command, args = []) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Environment variable Redis (DB_KV_REST_API_URL / DB_KV_REST_API_TOKEN) belum dikonfigurasi.');
  }

  const response = await fetch(`${REDIS_URL}/${command}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });

  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(`Redis ${command.toUpperCase()} gagal: ${response.status} ${rawError}`);
  }

  return response.json();
}

function getUserPositionsKey(userId) {
  return `masako_positions_${userId}`;
}

async function getActivePositionsByUser(userId) {
  const payload = await redisCommand('get', [getUserPositionsKey(userId)]);
  const raw = payload?.result;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function saveActivePositionsByUser(userId, positions) {
  return redisCommand('set', [getUserPositionsKey(userId), JSON.stringify(positions)]);
}

module.exports = { redisCommand, getActivePositionsByUser, saveActivePositionsByUser, getUserPositionsKey };
