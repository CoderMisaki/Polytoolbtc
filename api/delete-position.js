const { setCors } = require('./_cors');
const { requireAuth } = require('./_auth');
const { checkRateLimit, applyRateLimitHeaders } = require('./_rateLimit');
const { publicError, getPositionId, deletePosition } = require('./_positions');

module.exports = async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Allow', 'DELETE, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE' && req.method !== 'POST') return publicError(res, 405, 'Method Not Allowed');

  try {
    const { userId } = await requireAuth(req);
    const rateLimit = await checkRateLimit(req, { userId, route: 'delete-position', limit: 30, windowMs: 60_000, failClosed: true });
    applyRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) return publicError(res, 429, 'Terlalu banyak request. Coba lagi sebentar lagi.');
    const result = await deletePosition(userId, getPositionId(req));
    if (result.error) return publicError(res, result.statusCode, result.error);
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 401 ? error.message : 'Request posisi gagal diproses.';
    return publicError(res, statusCode, message);
  }
};
