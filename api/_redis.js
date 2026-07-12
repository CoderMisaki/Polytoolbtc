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


function getUserStateKey(userId) {
  return `masako_user_state_${userId}`;
}

async function getUserState(userId) {
  const payload = await redisCommand('get', [getUserStateKey(userId)]);
  const raw = payload?.result;
  if (!raw) return { balance: 10000, history: [] };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return {
        balance: typeof parsed.balance === 'number' ? parsed.balance : 10000,
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    } catch {
      return { balance: 10000, history: [] };
    }
  }
  return { balance: 10000, history: [] };
}

async function saveUserState(userId, state) {
  return redisCommand('set', [getUserStateKey(userId), JSON.stringify(state)]);
}

const ACTIVE_USERS_INDEX_KEY = 'masako_active_users';

async function getActiveUsers() {
  const payload = await redisCommand('smembers', [ACTIVE_USERS_INDEX_KEY]);
  const raw = payload?.result;
  if (Array.isArray(raw)) return raw;
  return [];
}

async function addUserToIndex(userId) {
  return redisCommand('sadd', [ACTIVE_USERS_INDEX_KEY, userId]);
}

async function removeUserFromIndex(userId) {
  return redisCommand('srem', [ACTIVE_USERS_INDEX_KEY, userId]);
}

module.exports = { redisCommand, getActivePositionsByUser, saveActivePositionsByUser, getUserPositionsKey, getUserStateKey, getUserState, saveUserState, getActiveUsers, addUserToIndex, removeUserFromIndex };
