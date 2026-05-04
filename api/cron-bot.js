const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const ACTIVE_POSITIONS_KEY = 'masako_active_positions';
const BINANCE_BTCUSDT_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';

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

module.exports = async function handler(_req, res) {
  const executionLogs = [];

  try {
    const positions = await getActivePositions();

    if (positions.length === 0) {
      return res.status(200).json({
        success: true,
        price: null,
        closed: 0,
        remaining: 0,
        logs: ['Tidak ada posisi aktif.']
      });
    }

    const tickerResponse = await fetch(BINANCE_BTCUSDT_URL);
    if (!tickerResponse.ok) {
      throw new Error(`Binance response ${tickerResponse.status}`);
    }

    const tickerData = await tickerResponse.json();
    const currentPrice = Number(tickerData?.price);

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error('Harga BTCUSDT tidak valid dari Binance.');
    }

    const remainingPositions = [];
    let closedCount = 0;

    for (const pos of positions) {
      const type = pos?.type;
      const sl = Number(pos?.sl);
      const tp = Number(pos?.tp);

      let shouldClose = false;
      let reason = '';

      if (type === 'LONG') {
        if (Number.isFinite(sl) && currentPrice <= sl) {
          shouldClose = true;
          reason = 'STOP LOSS';
        } else if (Number.isFinite(tp) && currentPrice >= tp) {
          shouldClose = true;
          reason = 'TAKE PROFIT';
        }
      } else if (type === 'SHORT') {
        if (Number.isFinite(sl) && currentPrice >= sl) {
          shouldClose = true;
          reason = 'STOP LOSS';
        } else if (Number.isFinite(tp) && currentPrice <= tp) {
          shouldClose = true;
          reason = 'TAKE PROFIT';
        }
      }

      if (shouldClose) {
        closedCount += 1;
        executionLogs.push(
          `[${new Date().toISOString()}] Closed ${pos?.id ?? 'unknown-id'} (${type}) via ${reason} at ${currentPrice}`
        );
      } else {
        remainingPositions.push(pos);
      }
    }

    await redisCommand('set', ACTIVE_POSITIONS_KEY, JSON.stringify(remainingPositions));

    return res.status(200).json({
      success: true,
      price: currentPrice,
      closed: closedCount,
      remaining: remainingPositions.length,
      logs: executionLogs.length > 0 ? executionLogs : ['Tidak ada SL/TP yang tersentuh.']
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      logs: executionLogs,
      error: error.message
    });
  }
};
