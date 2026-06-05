const { redisCommand } = require('./_redis');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown-ip';
}

function sanitizeKeyPart(value, fallback) {
  const raw = String(value || fallback).trim();
  return raw.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 160) || fallback;
}

function parseRedisInteger(payload, fallback = 0) {
  const value = Number(payload?.result);
  return Number.isFinite(value) ? value : fallback;
}

async function getResetAt(key, now, windowMs) {
  const ttlPayload = await redisCommand('ttl', [key]);
  const ttlSeconds = parseRedisInteger(ttlPayload, -1);
  if (ttlSeconds > 0) return now + (ttlSeconds * 1000);
  return now + windowMs;
}

async function checkRateLimit(req, { userId = 'anonymous', route = 'api', limit = 60, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const normalizedLimit = Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 60);
  const normalizedWindowMs = Math.max(1000, Number.isFinite(Number(windowMs)) ? Math.floor(Number(windowMs)) : 60_000);
  const windowSeconds = Math.max(1, Math.ceil(normalizedWindowMs / 1000));
  const ip = sanitizeKeyPart(getClientIp(req), 'unknown-ip');
  const safeRoute = sanitizeKeyPart(route, 'api');
  const safeUserId = sanitizeKeyPart(userId, 'anonymous');
  const key = `ratelimit:${safeRoute}:${safeUserId}:${ip}`;

  if (typeof redisCommand !== 'function') {
    return { allowed: true, remaining: Math.max(0, normalizedLimit - 1), resetAt: now + normalizedWindowMs };
  }

  try {
    const countPayload = await redisCommand('incr', [key]);
    const count = parseRedisInteger(countPayload, 1);

    if (count === 1) {
      await redisCommand('expire', [key, windowSeconds]);
    }

    const resetAt = await getResetAt(key, now, normalizedWindowMs);
    const remaining = Math.max(0, normalizedLimit - count);

    return {
      allowed: count <= normalizedLimit,
      remaining,
      resetAt
    };
  } catch (error) {
    console.error('Rate limit Redis check failed:', error.message);
    return { allowed: true, remaining: Math.max(0, normalizedLimit - 1), resetAt: now + normalizedWindowMs };
  }
}

function applyRateLimitHeaders(res, result) {
  if (!result) return;
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
}

module.exports = { checkRateLimit, applyRateLimitHeaders };
