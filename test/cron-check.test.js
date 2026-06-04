const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function mockResponse() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
}

function loadCronCheckWithMocks({ positions = [], requireAuthImpl } = {}) {
  const cronPath = path.resolve(__dirname, '../api/cron-check.js');
  const authPath = path.resolve(__dirname, '../api/_auth.js');
  const redisPath = path.resolve(__dirname, '../api/_redis.js');
  delete require.cache[cronPath];
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
  return require(cronPath);
}

function position(overrides = {}) {
  return {
    id: 'pos_1',
    pair: 'BTCUSDT',
    type: 'LONG',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    ...overrides
  };
}

function installTickerFetchMock(priceByPair, failedPairs = new Set()) {
  const calls = [];
  global.fetch = async (url) => {
    const parsed = new URL(url);
    const pair = parsed.searchParams.get('symbol');
    calls.push(pair);
    if (failedPairs.has(pair)) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({ price: String(priceByPair[pair]) }) };
  };
  return calls;
}

test('getTickerPrice menolak pair di luar whitelist tanpa fetch', async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ price: '1' }) };
  };
  const cronCheck = loadCronCheckWithMocks();
  await assert.rejects(() => cronCheck.getTickerPrice('BNBUSDT'), /tidak didukung/);
  assert.equal(fetchCalled, false);
});

test('cron-check menutup posisi BTC memakai harga BTC', async () => {
  const positions = [position({ id: 'pos_btc', pair: 'BTCUSDT', type: 'LONG', sl: 59000, tp: 65000 })];
  const calls = installTickerFetchMock({ BTCUSDT: 65000 });
  const handler = loadCronCheckWithMocks({ positions });
  const req = { method: 'POST', headers: { authorization: 'Bearer test' }, socket: { remoteAddress: 'cron-btc' } };
  const res = mockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['BTCUSDT']);
  assert.equal(res.body.closed, 1);
  assert.equal(res.body.remaining, 0);
  assert.deepEqual(res.body.prices, { BTCUSDT: 65000 });
  assert.equal(res.body.price, 65000);
  assert.equal(positions.length, 0);
  assert.match(res.body.logs.join('\n'), /Closed pos_btc BTCUSDT LONG via TAKE PROFIT at 65000/);
});

test('cron-check menutup posisi ETH memakai harga ETH, bukan harga BTC', async () => {
  const positions = [position({ id: 'pos_eth', pair: 'ETHUSDT', type: 'LONG', sl: 2900, tp: 3200 })];
  const calls = installTickerFetchMock({ BTCUSDT: 65000, ETHUSDT: 3200 });
  const handler = loadCronCheckWithMocks({ positions });
  const req = { method: 'POST', headers: { authorization: 'Bearer test' }, socket: { remoteAddress: 'cron-eth' } };
  const res = mockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['ETHUSDT']);
  assert.equal(res.body.closed, 1);
  assert.equal(res.body.remaining, 0);
  assert.deepEqual(res.body.prices, { ETHUSDT: 3200 });
  assert.equal(res.body.price, 3200);
  assert.equal(positions.length, 0);
  assert.match(res.body.logs.join('\n'), /Closed pos_eth ETHUSDT LONG via TAKE PROFIT at 3200/);
});

test('cron-check mixed BTC + ETH: BTC kena TP dan ETH tetap remaining', async () => {
  const positions = [
    position({ id: 'pos_btc', pair: 'BTCUSDT', type: 'LONG', sl: 59000, tp: 65000 }),
    position({ id: 'pos_eth', pair: 'ETHUSDT', type: 'LONG', sl: 2900, tp: 3300 })
  ];
  const calls = installTickerFetchMock({ BTCUSDT: 65000, ETHUSDT: 3200 });
  const handler = loadCronCheckWithMocks({ positions });
  const req = { method: 'POST', headers: { authorization: 'Bearer test' }, socket: { remoteAddress: 'cron-mixed' } };
  const res = mockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.sort(), ['BTCUSDT', 'ETHUSDT']);
  assert.equal(res.body.closed, 1);
  assert.equal(res.body.remaining, 1);
  assert.deepEqual(res.body.prices, { BTCUSDT: 65000, ETHUSDT: 3200 });
  assert.equal(res.body.price, null);
  assert.deepEqual(positions.map((p) => p.id), ['pos_eth']);
});

test('cron-check tidak menghapus posisi jika fetch harga salah satu pair gagal', async () => {
  const positions = [
    position({ id: 'pos_btc', pair: 'BTCUSDT', type: 'LONG', sl: 59000, tp: 65000 }),
    position({ id: 'pos_eth', pair: 'ETHUSDT', type: 'LONG', sl: 2900, tp: 3200 })
  ];
  const calls = installTickerFetchMock({ BTCUSDT: 65000 }, new Set(['ETHUSDT']));
  const handler = loadCronCheckWithMocks({ positions });
  const req = { method: 'POST', headers: { authorization: 'Bearer test' }, socket: { remoteAddress: 'cron-fail' } };
  const res = mockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.sort(), ['BTCUSDT', 'ETHUSDT']);
  assert.equal(res.body.closed, 1);
  assert.equal(res.body.remaining, 1);
  assert.deepEqual(res.body.prices, { BTCUSDT: 65000 });
  assert.deepEqual(positions.map((p) => p.id), ['pos_eth']);
  assert.match(res.body.logs.join('\n'), /Skipped ETHUSDT: fetch harga gagal/);
  assert.match(res.body.logs.join('\n'), /Skipped pos_eth ETHUSDT: harga tidak tersedia/);
});
