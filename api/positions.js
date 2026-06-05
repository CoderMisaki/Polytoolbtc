const { setCors } = require('./_cors');
const { requireAuth } = require('./_auth');
const { checkRateLimit, applyRateLimitHeaders } = require('./_rateLimit');
const { publicError, getPositionId, listPositions, deletePosition, updatePosition } = require('./_positions');

module.exports = async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Allow', 'GET, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) return publicError(res, 405, 'Method Not Allowed');

  try {
    const { userId } = await requireAuth(req);
    const isWrite = req.method !== 'GET';
    const rateLimit = await checkRateLimit(req, { userId, route: 'positions', limit: isWrite ? 30 : 60, windowMs: 60_000, failClosed: isWrite });
    applyRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) return publicError(res, 429, 'Terlalu banyak request. Coba lagi sebentar lagi.');

    if (req.method === 'GET') {
      const positions = await listPositions(userId);
      return res.status(200).json({ success: true, positions, total_positions: positions.length });
    }

    const result = req.method === 'DELETE'
      ? await deletePosition(userId, getPositionId(req))
      : await updatePosition(userId, req.body);
    if (result.error) return publicError(res, result.statusCode, result.error);
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 401 ? error.message : 'Request posisi gagal diproses.';
    return publicError(res, statusCode, message);
  }
};
