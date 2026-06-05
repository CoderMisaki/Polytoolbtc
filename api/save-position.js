const { setCors } = require('./_cors');
const { requireAuth } = require('./_auth');
const { getActivePositionsByUser, saveActivePositionsByUser } = require('./_redis');
const { checkRateLimit, applyRateLimitHeaders } = require('./_rateLimit');
const { MAX_ACTIVE_POSITIONS_PER_USER, validatePositionPayload } = require('./_validation');

function sendPublicError(res, statusCode, error) {
  return res.status(statusCode).json({ success: false, error });
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return sendPublicError(res, 405, 'Method Not Allowed');
  }

  try {
    const { userId } = await requireAuth(req);
    const rateLimit = await checkRateLimit(req, { userId, route: 'save-position', limit: 30, windowMs: 60_000 });
    applyRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      return sendPublicError(res, 429, 'Terlalu banyak request. Coba lagi sebentar lagi.');
    }

    const validation = validatePositionPayload(req.body);
    if (!validation.valid) {
      return sendPublicError(res, 400, validation.error);
    }

    const positions = await getActivePositionsByUser(userId);
    if (positions.length >= MAX_ACTIVE_POSITIONS_PER_USER) {
      return sendPublicError(res, 400, `Maksimal ${MAX_ACTIVE_POSITIONS_PER_USER} posisi aktif per user untuk mode demo.`);
    }

    const nextPositions = positions.concat(validation.value);
    await saveActivePositionsByUser(userId, nextPositions);

    return res.status(200).json({ success: true, total_positions: nextPositions.length });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 401 ? error.message : 'Request posisi gagal diproses.';
    return sendPublicError(res, statusCode, message);
  }
};
