const { setCors } = require('./_cors');
const { requireAuth } = require('./_auth');
const { getActivePositionsByUser, saveActivePositionsByUser } = require('./_redis');
const { checkRateLimit, applyRateLimitHeaders } = require('./_rateLimit');
const { ALLOWED_PAIRS } = require('./_validation');

const BINANCE_TICKER_URL = 'https://api.binance.com/api/v3/ticker/price';

function normalizeTickerPair(pair) {
  const normalizedPair = String(pair || '').toUpperCase();
  if (!ALLOWED_PAIRS.has(normalizedPair)) {
    throw new Error(`Pair ${normalizedPair || 'UNKNOWN'} tidak didukung untuk mode demo.`);
  }
  return normalizedPair;
}

async function getTickerPrice(pair) {
  const normalizedPair = normalizeTickerPair(pair);
  const tickerResponse = await fetch(`${BINANCE_TICKER_URL}?symbol=${encodeURIComponent(normalizedPair)}`, { method: 'GET' });
  if (!tickerResponse.ok) throw new Error(`Binance ${normalizedPair} response ${tickerResponse.status}`);
  const tickerData = await tickerResponse.json();
  const currentPrice = Number(tickerData?.price);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error(`Harga ${normalizedPair} tidak valid dari Binance.`);
  return currentPrice;
}

function shouldClosePosition(position, currentPrice) {
  const type = position?.type;
  const sl = Number(position?.sl);
  const tp = Number(position?.tp);

  if (type === 'LONG') {
    if (Number.isFinite(sl) && currentPrice <= sl) return 'STOP LOSS';
    if (Number.isFinite(tp) && currentPrice >= tp) return 'TAKE PROFIT';
  }
  if (type === 'SHORT') {
    if (Number.isFinite(sl) && currentPrice >= sl) return 'STOP LOSS';
    if (Number.isFinite(tp) && currentPrice <= tp) return 'TAKE PROFIT';
  }
  return null;
}

function getPositionPair(position) {
  try {
    return normalizeTickerPair(position?.pair);
  } catch {
    return null;
  }
}

async function fetchPricesByPair(pairs, executionLogs) {
  const priceEntries = await Promise.all(pairs.map(async (pair) => {
    try {
      return [pair, await getTickerPrice(pair), null];
    } catch (error) {
      executionLogs.push(`[${new Date().toISOString()}] Skipped ${pair}: fetch harga gagal (${error.message})`);
      return [pair, null, error];
    }
  }));

  const prices = {};
  const failedPairs = new Set();
  for (const [pair, price, error] of priceEntries) {
    if (error) {
      failedPairs.add(pair);
    } else {
      prices[pair] = price;
    }
  }
  return { prices, failedPairs };
}

async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const executionLogs = [];
  try {
    const { userId } = await requireAuth(req);
    const rateLimit = await checkRateLimit(req, { userId, route: 'cron-check', limit: 60, windowMs: 60_000 });
    applyRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, logs: executionLogs, error: 'Terlalu banyak request. Coba lagi sebentar lagi.' });
    }

    const positions = await getActivePositionsByUser(userId);
    if (positions.length === 0) return res.status(200).json({ success: true, prices: {}, price: null, closed: 0, remaining: 0, logs: ['Tidak ada posisi aktif.'] });

    const validPairs = [...new Set(positions.map(getPositionPair).filter(Boolean))];
    const { prices, failedPairs } = await fetchPricesByPair(validPairs, executionLogs);
    const remainingPositions = [];
    let closedCount = 0;

    for (const position of positions) {
      const pair = getPositionPair(position);
      if (!pair) {
        remainingPositions.push(position);
        executionLogs.push(`[${new Date().toISOString()}] Skipped ${position?.id ?? 'unknown-id'} ${position?.pair ?? 'UNKNOWN'}: pair tidak valid.`);
        continue;
      }

      const currentPrice = prices[pair];
      if (failedPairs.has(pair) || !Number.isFinite(currentPrice)) {
        remainingPositions.push(position);
        executionLogs.push(`[${new Date().toISOString()}] Skipped ${position?.id ?? 'unknown-id'} ${pair}: harga tidak tersedia.`);
        continue;
      }

      const closeReason = shouldClosePosition(position, currentPrice);
      if (closeReason) {
        closedCount += 1;
        executionLogs.push(`[${new Date().toISOString()}] Closed ${position?.id ?? 'unknown-id'} ${pair} ${position?.type ?? 'UNKNOWN'} via ${closeReason} at ${currentPrice}`);
      } else {
        remainingPositions.push(position);
      }
    }

    await saveActivePositionsByUser(userId, remainingPositions);
    const responseBody = {
      success: true,
      prices,
      closed: closedCount,
      remaining: remainingPositions.length,
      logs: executionLogs.length ? executionLogs : ['Tidak ada SL/TP yang tersentuh.']
    };
    const fetchedPairs = Object.keys(prices);
    responseBody.price = fetchedPairs.length === 1 ? prices[fetchedPairs[0]] : null;
    return res.status(200).json(responseBody);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 401 ? error.message : 'Request cron-check gagal diproses.';
    return res.status(statusCode).json({ success: false, logs: executionLogs, error: message });
  }
};


module.exports = handler;
module.exports.shouldClosePosition = shouldClosePosition;
module.exports.getTickerPrice = getTickerPrice;
module.exports.normalizeTickerPair = normalizeTickerPair;
