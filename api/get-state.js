const { setCors } = require('./_cors');
const { requireAuth } = require('./_auth');
const { getActivePositionsByUser, getUserState } = require('./_redis');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { userId } = await requireAuth(req);
    const positions = await getActivePositionsByUser(userId);
    const userState = await getUserState(userId);

    return res.status(200).json({
      success: true,
      balance: userState.balance,
      positions: positions || [],
      history: userState.history || []
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, error: statusCode === 401 ? error.message : 'Gagal mengambil state.' });
  }
};
