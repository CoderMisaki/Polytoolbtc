const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { MAX_ACTIVE_POSITIONS_PER_USER, validatePositionPayload } = require('../api/_validation');

function validPosition(overrides = {}) {
  return {
    id: `pos_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    pair: 'BTCUSDT',
    type: 'LONG',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    leverage: 10,
    margin: 100,
    marginMode: 'CROSS',
    createdAt: Date.now(),
    ...overrides
  };
}

function mockResponse() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
}

function loadSavePositionWithMocks({ positions = [], requireAuthImpl } = {}) {
  const savePath = path.resolve(__dirname, '../api/save-position.js');
  const authPath = path.resolve(__dirname, '../api/_auth.js');
  const redisPath = path.resolve(__dirname, '../api/_redis.js');
  const ratePath = path.resolve(__dirname, '../api/_rateLimit.js');
  const positionsPath = path.resolve(__dirname, '../api/_positions.js');
  delete require.cache[savePath];
  delete require.cache[positionsPath];
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: requireAuthImpl || (async () => ({ userId: 'user-1' })) } };
  require.cache[ratePath] = { id: ratePath, filename: ratePath, loaded: true, exports: { checkRateLimit: async () => ({ allowed: true, remaining: 29, resetAt: Date.now() + 60000 }), applyRateLimitHeaders: () => {} } };
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: {
      getActivePositionsByUser: async () => positions.slice(),
      saveActivePositionsByUser: async (_userId, next) => { positions.splice(0, positions.length, ...next); }
    }
  };
  return require(savePath);
}

test('save-position rejects posisi tanpa token', async () => {
  const handler = require('../api/save-position');
  const req = { method: 'POST', headers: {}, body: validPosition(), socket: {} };
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test('validator rejects body kosong', () => {
  assert.equal(validatePositionPayload(null).valid, false);
});

test('validator rejects entryPrice, sl, tp non-number', () => {
  for (const field of ['entryPrice', 'sl', 'tp']) {
    const result = validatePositionPayload(validPosition({ [field]: 'abc' }));
    assert.equal(result.valid, false, field);
  }
});

test('validator rejects LONG dengan sl >= entryPrice', () => {
  assert.equal(validatePositionPayload(validPosition({ type: 'LONG', sl: 100 })).valid, false);
});

test('validator rejects LONG dengan tp <= entryPrice', () => {
  assert.equal(validatePositionPayload(validPosition({ type: 'LONG', tp: 100 })).valid, false);
});

test('validator rejects SHORT dengan sl <= entryPrice', () => {
  assert.equal(validatePositionPayload(validPosition({ type: 'SHORT', sl: 100, tp: 90 })).valid, false);
});

test('validator rejects SHORT dengan tp >= entryPrice', () => {
  assert.equal(validatePositionPayload(validPosition({ type: 'SHORT', sl: 120, tp: 100 })).valid, false);
});

test('validator rejects leverage di luar 1-125', () => {
  assert.equal(validatePositionPayload(validPosition({ leverage: 0 })).valid, false);
  assert.equal(validatePositionPayload(validPosition({ leverage: 126 })).valid, false);
});

test('validator rejects pair di luar whitelist', () => {
  assert.equal(validatePositionPayload(validPosition({ pair: 'BNBUSDT' })).valid, false);
});

test('validator rejects type selain LONG/SHORT', () => {
  assert.equal(validatePositionPayload(validPosition({ type: 'BUY' })).valid, false);
});

test('save-position rejects posisi lebih dari limit aktif', async () => {
  const positions = Array.from({ length: MAX_ACTIVE_POSITIONS_PER_USER }, (_, index) => validPosition({ id: `pos_${index}` }));
  const handler = loadSavePositionWithMocks({ positions });
  const req = { method: 'POST', headers: { authorization: 'Bearer test' }, body: validPosition({ id: 'pos_new' }), socket: {} };
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});


test('save-position rejects duplicate id untuk user yang sama', async () => {
  const duplicate = validPosition({ id: 'pos_duplicate_safe' });
  const positions = [duplicate];
  const handler = loadSavePositionWithMocks({ positions });
  const req = { method: 'POST', headers: { authorization: 'Bearer test' }, body: validPosition({ id: duplicate.id }), socket: {} };
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(positions.length, 1);
});

test('delete-position only deletes positions from authenticated token user', async () => {
  const deletePath = path.resolve(__dirname, '../api/delete-position.js');
  const positionsPath = path.resolve(__dirname, '../api/_positions.js');
  const authPath = path.resolve(__dirname, '../api/_auth.js');
  const redisPath = path.resolve(__dirname, '../api/_redis.js');
  const ratePath = path.resolve(__dirname, '../api/_rateLimit.js');
  delete require.cache[deletePath];
  delete require.cache[positionsPath];
  const byUser = {
    'user-1': [validPosition({ id: 'owned_pos' })],
    'user-2': [validPosition({ id: 'owned_pos' })]
  };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: async () => ({ userId: 'user-1' }) } };
  require.cache[ratePath] = { id: ratePath, filename: ratePath, loaded: true, exports: { checkRateLimit: async () => ({ allowed: true, remaining: 29, resetAt: Date.now() + 60000 }), applyRateLimitHeaders: () => {} } };
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: {
      getActivePositionsByUser: async (userId) => byUser[userId].slice(),
      saveActivePositionsByUser: async (userId, next) => { byUser[userId] = next; }
    }
  };
  const handler = require(deletePath);
  const req = { method: 'DELETE', headers: { authorization: 'Bearer test' }, body: { id: 'owned_pos' }, socket: {} };
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(byUser['user-1'].length, 0);
  assert.equal(byUser['user-2'].length, 1);
});

test('validator rejects createdAt/openTime terlalu jauh di masa depan', () => {
  const future = Date.now() + 10 * 60 * 1000;
  assert.equal(validatePositionPayload(validPosition({ createdAt: future })).valid, false);
  assert.equal(validatePositionPayload(validPosition({ openTime: future })).valid, false);
});
