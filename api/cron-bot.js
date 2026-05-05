const REDIS_URL = process.env.DB_KV_REST_API_URL;
const REDIS_TOKEN = process.env.DB_KV_REST_API_TOKEN;

const ACTIVE_POSITIONS_KEY = 'masako_active_positions';
const BINANCE_BTCUSDT_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';

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

async function saveActivePositions(positions) {
  await redisCommand('set', [ACTIVE_POSITIONS_KEY, JSON.stringify(positions)]);
}

async function getBtcUsdtPrice() {
  const tickerResponse = await fetch(BINANCE_BTCUSDT_URL, {
    method: 'GET'
  });

  if (!tickerResponse.ok) {
    throw new Error(`Binance response ${tickerResponse.status}`);
  }

  const tickerData = await tickerResponse.json();
  const currentPrice = Number(tickerData?.price);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('Harga BTCUSDT tidak valid dari Binance.');
  }

  return currentPrice;
}

function shouldClosePosition(position, currentPrice) {
  const type = position?.type;
  const sl = Number(position?.sl);
  const tp = Number(position?.tp);

  if (type === 'LONG') {
    if (Number.isFinite(sl) && currentPrice <= sl) return 'STOP LOSS';
    if (Number.isFinite(tp) && currentPrice >= tp) return 'TAKE PROFIT';
    return null;
  }

  if (type === 'SHORT') {
    if (Number.isFinite(sl) && currentPrice >= sl) return 'STOP LOSS';
    if (Number.isFinite(tp) && currentPrice <= tp) return 'TAKE PROFIT';
    return null;
  }

  return null;
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

    const currentPrice = await getBtcUsdtPrice();

    const remainingPositions = [];
    let closedCount = 0;

    for (const position of positions) {
      const closeReason = shouldClosePosition(position, currentPrice);

      if (closeReason) {
        closedCount += 1;
        executionLogs.push(
          `[${new Date().toISOString()}] Closed ${position?.id ?? 'unknown-id'} (${position?.type ?? 'UNKNOWN'}) via ${closeReason} at ${currentPrice}`
        );
      } else {
        remainingPositions.push(position);
      }
    }

    await saveActivePositions(remainingPositions);

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
