const REDIS_URL = process.env.DB_KV_REST_API_URL;
const REDIS_TOKEN = process.env.DB_KV_REST_API_TOKEN;

const ACTIVE_POSITIONS_KEY = 'masako_active_positions';

function buildRedisCommandUrl(command, args = []) {
  const encodedArgs = args.map((value) => encodeURIComponent(String(value)));
  return `${REDIS_URL}/${command}/${encodedArgs.join('/')}`;
}

async function redisCommand(command, args = []) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Environment variable Redis (DB_KV_REST_API_URL / DB_KV_REST_API_TOKEN) belum dikonfigurasi.');
  }

  const response = await fetch(buildRedisCommandUrl(command, args), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`
    }
  });

  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(`Redis ${command.toUpperCase()} gagal: ${response.status} ${rawError}`);
  }

  return response.json();
}

async function getActivePositions() {
  const payload = await redisCommand('get', [ACTIVE_POSITIONS_KEY]);
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const nextPosition = req.body;

    if (!nextPosition || typeof nextPosition !== 'object') {
      return res.status(400).json({ success: false, error: 'Body posisi tidak valid.' });
    }

    const positions = await getActivePositions();
    positions.push(nextPosition);

    await redisCommand('set', [ACTIVE_POSITIONS_KEY, JSON.stringify(positions)]);

    return res.status(200).json({
      success: true,
      total_positions: positions.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
