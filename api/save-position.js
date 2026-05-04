const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const ACTIVE_POSITIONS_KEY = 'masako_active_positions';

async function redisCommand(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Upstash Redis environment variables are not configured.');
  }

  const res = await fetch(`${REDIS_URL}/${command}/${args.map((a) => encodeURIComponent(String(a))).join('/')}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`
    }
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Redis ${command} failed: ${res.status} ${message}`);
  }

  return res.json();
}

async function getActivePositions() {
  const payload = await redisCommand('get', ACTIVE_POSITIONS_KEY);
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
    const positions = await getActivePositions();
    positions.push(req.body);

    await redisCommand('set', ACTIVE_POSITIONS_KEY, JSON.stringify(positions));

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
