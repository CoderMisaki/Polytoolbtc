const { requireAuth } = require('./_auth');
const { getActivePositionsByUser, saveActivePositionsByUser } = require('./_redis');

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { userId } = await requireAuth(req);
    const nextPosition = req.body;

    if (!nextPosition || typeof nextPosition !== 'object' || Array.isArray(nextPosition)) {
      return res.status(400).json({ success: false, error: 'Body posisi tidak valid.' });
    }

    if (!isFiniteNumber(nextPosition.entryPrice) || !isFiniteNumber(nextPosition.sl) || !isFiniteNumber(nextPosition.tp)) {
      return res.status(400).json({
        success: false,
        error: 'Field entryPrice, sl, dan tp wajib berupa angka valid (finite number).'
      });
    }

    const positions = await getActivePositionsByUser(userId);
    positions.push(nextPosition);
    await saveActivePositionsByUser(userId, positions);

    return res.status(200).json({ success: true, total_positions: positions.length });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};
