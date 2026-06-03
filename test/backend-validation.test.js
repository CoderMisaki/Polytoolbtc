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
  delete require.cache[savePath];
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: requireAuthImpl || (async () => ({ userId: 'user-1' })) } };
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
