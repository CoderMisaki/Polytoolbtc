const { setCors } = require('./_cors');

/**
 * LEGACY / ADMIN-ONLY PLACEHOLDER
 *
 * The multi-user app stores active positions under per-user keys:
 *   masako_positions_${userId}
 *
 * This endpoint intentionally does not scan or mutate the historical global
 * `masako_active_positions` key. A global cron could close another user's demo
 * position incorrectly, so authenticated per-user checks must use
 * `/api/cron-check` instead.
 */
module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  return res.status(410).json({
    success: false,
    error: 'cron-bot legacy dinonaktifkan. Gunakan cron-check per user yang terautentikasi.'
  });
};
