const { requireAuth } = require('./_auth');
const { getActivePositionsByUser, saveActivePositionsByUser } = require('./_redis');

const BINANCE_BTCUSDT_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';

async function getBtcUsdtPrice() {
  const tickerResponse = await fetch(BINANCE_BTCUSDT_URL, { method: 'GET' });
  if (!tickerResponse.ok) throw new Error(`Binance response ${tickerResponse.status}`);
  const tickerData = await tickerResponse.json();
  const currentPrice = Number(tickerData?.price);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error('Harga BTCUSDT tidak valid dari Binance.');
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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const executionLogs = [];
  try {
    const { userId } = await requireAuth(req);
    const positions = await getActivePositionsByUser(userId);
    if (positions.length === 0) return res.status(200).json({ success: true, price: null, closed: 0, remaining: 0, logs: ['Tidak ada posisi aktif.'] });

    const currentPrice = await getBtcUsdtPrice();
    const remainingPositions = [];
    let closedCount = 0;

    for (const position of positions) {
      const closeReason = shouldClosePosition(position, currentPrice);
      if (closeReason) {
        closedCount += 1;
        executionLogs.push(`[${new Date().toISOString()}] Closed ${position?.id ?? 'unknown-id'} (${position?.type ?? 'UNKNOWN'}) via ${closeReason} at ${currentPrice}`);
      } else {
        remainingPositions.push(position);
      }
    }

    await saveActivePositionsByUser(userId, remainingPositions);
    return res.status(200).json({ success: true, price: currentPrice, closed: closedCount, remaining: remainingPositions.length, logs: executionLogs.length ? executionLogs : ['Tidak ada SL/TP yang tersentuh.'] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, logs: executionLogs, error: error.message });
  }
};
