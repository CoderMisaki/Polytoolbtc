const { setCors } = require('./_cors');
const { ALLOWED_PAIR_SET } = require('../shared/pairs');

const ALLOWED_EVENTS = new Set(['pair_fetch_repeated_failure']);
const MAX_MESSAGE_LENGTH = 240;

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return {};
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req);
  const event = String(body.event || '');
  const pair = String(body.pair || '').toUpperCase();
  const retryCount = Number(body.retryCount || 0);
  const failureCount = Number(body.failureCount || 0);
  const source = String(body.source || 'frontend').slice(0, 32);
  const message = String(body.message || '').slice(0, MAX_MESSAGE_LENGTH);

  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'Unsupported telemetry event' });
  }
  if (!ALLOWED_PAIR_SET.has(pair)) {
    return res.status(400).json({ error: 'Unsupported pair' });
  }

  const payload = {
    event,
    pair,
    retryCount: Number.isFinite(retryCount) ? retryCount : 0,
    failureCount: Number.isFinite(failureCount) ? failureCount : 0,
    source,
    message,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 160),
    at: new Date().toISOString()
  };

  // Vercel captures console.error output for alert routing/log drains.
  console.error('[telemetry-alert]', JSON.stringify(payload));
  return res.status(202).json({ ok: true });
};
