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

function loadPositionHandlersWithMockRedis() {
  const modulePaths = [
    '../api/save-position.js',
    '../api/update-position.js',
    '../api/delete-position.js',
    '../api/positions.js',
    '../api/_positions.js'
  ].map((modulePath) => path.resolve(__dirname, modulePath));
  const authPath = path.resolve(__dirname, '../api/_auth.js');
  const redisPath = path.resolve(__dirname, '../api/_redis.js');
  const ratePath = path.resolve(__dirname, '../api/_rateLimit.js');

  modulePaths.forEach((modulePath) => delete require.cache[modulePath]);
  const redisByUser = new Map();

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: { requireAuth: async () => ({ userId: 'browser-user' }) }
  };
  require.cache[ratePath] = {
    id: ratePath,
    filename: ratePath,
    loaded: true,
    exports: {
      checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
      applyRateLimitHeaders: () => {}
    }
  };
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: {
      getActivePositionsByUser: async (userId) => (redisByUser.get(userId) || []).map((position) => ({ ...position })),
      saveActivePositionsByUser: async (userId, positions) => {
        redisByUser.set(userId, positions.map((position) => ({ ...position })));
      }
    }
  };

  return {
    redisByUser,
    handlers: {
      '/api/save-position': require('../api/save-position'),
      '/api/update-position': require('../api/update-position'),
      '/api/delete-position': require('../api/delete-position'),
      '/api/positions': require('../api/positions')
    }
  };
}

function createBrowserApiFetch(handlers) {
  return async function apiFetch(url, options = {}) {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const req = {
      method: options.method || 'GET',
      headers: { authorization: 'Bearer browser-token' },
      body,
      query: body && body.id ? { id: body.id } : {},
      socket: { remoteAddress: '127.0.0.1' }
    };
    const res = mockResponse();
    await handlers[url](req, res);
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      json: async () => res.body
    };
  };
}

test('browser integration: open → save → partial close → update → full close leaves Redis empty', async () => {
  const { redisByUser, handlers } = loadPositionHandlersWithMockRedis();
  const window = {
    MasakoAuth: { isAuthenticated: true, token: 'browser-token' },
    apiFetch: createBrowserApiFetch(handlers)
  };

  const openedPosition = {
    id: 'browser_flow_pos',
    pair: 'BTCUSDT',
    type: 'LONG',
    entryPrice: 100,
    tp: null,
    sl: null,
    leverage: 10,
    margin: 100,
    marginMode: 'CROSS',
    createdAt: Date.now()
  };

  let response = await window.apiFetch('/api/save-position', {
    method: 'POST',
    body: JSON.stringify(openedPosition)
  });
  assert.equal(response.ok, true, await response.json());
  assert.equal(redisByUser.get('browser-user').length, 1);

  response = await window.apiFetch('/api/update-position', {
    method: 'PATCH',
    body: JSON.stringify({ id: openedPosition.id, margin: 50, tp: null, sl: null })
  });
  assert.equal(response.ok, true, await response.json());
  let body = await response.json();
  assert.equal(body.position.margin, 50);
  assert.equal(body.position.tp, null);
  assert.equal(body.position.sl, null);

  response = await window.apiFetch('/api/update-position', {
    method: 'PATCH',
    body: JSON.stringify({ id: openedPosition.id, tp: 130, sl: 95, margin: 40 })
  });
  assert.equal(response.ok, true, await response.json());
  body = await response.json();
  assert.equal(body.position.tp, 130);
  assert.equal(body.position.sl, 95);
  assert.equal(body.position.margin, 40);

  response = await window.apiFetch('/api/delete-position', {
    method: 'DELETE',
    body: JSON.stringify({ id: openedPosition.id })
  });
  assert.equal(response.ok, true, await response.json());

  response = await window.apiFetch('/api/positions', { method: 'GET' });
  assert.equal(response.ok, true, await response.json());
  body = await response.json();
  assert.deepEqual(body.positions, []);
  assert.deepEqual(redisByUser.get('browser-user'), []);
});
