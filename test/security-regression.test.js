const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ALLOWED_PAIRS, ALLOWED_PAIR_SET, DEFAULT_PAIR } = require('../shared/pairs');
const { ALLOWED_PAIRS: VALIDATION_ALLOWED_PAIRS } = require('../api/_validation');

function loadRateLimitWithRedisMock(redisCommand) {
  const rateLimitPath = path.resolve(__dirname, '../api/_rateLimit.js');
  const redisPath = path.resolve(__dirname, '../api/_redis.js');
  delete require.cache[rateLimitPath];
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: { redisCommand }
  };
  return require(rateLimitPath);
}

test('frontend/backend pair whitelist uses shared source', () => {
  assert.deepEqual([...VALIDATION_ALLOWED_PAIRS], [...ALLOWED_PAIR_SET]);
  assert.equal(DEFAULT_PAIR, ALLOWED_PAIRS[0]);
  assert.ok(ALLOWED_PAIR_SET.has('BTCUSDT'));
});

test('HTML and JS templates do not contain inline style attributes', () => {
  const files = [
    'index.html',
    'src/main.js',
    'src/charts/chartSetup.js',
    'src/engines/futuresEngine.js'
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(content, /style\s*=/i, file);
  }
});

test('rate limiter uses Redis EVAL to atomically increment and set expiry', async () => {
  const calls = [];
  const { checkRateLimit } = loadRateLimitWithRedisMock(async (command, args) => {
    calls.push({ command, args });
    if (command === 'eval') return { result: 3 };
    if (command === 'ttl') return { result: 55 };
    throw new Error(`Unexpected Redis command: ${command}`);
  });

  const result = await checkRateLimit(
    { headers: { 'x-forwarded-for': '203.0.113.7' }, socket: {} },
    { userId: 'user-1', route: 'save-position', limit: 5, windowMs: 60_000 }
  );

  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 2);
  assert.equal(calls[0].command, 'eval');
  assert.deepEqual(calls[0].args, [
    "local c = redis.call('incr', KEYS[1]) if c == 1 then redis.call('expire', KEYS[1], ARGV[1]) end return c",
    1,
    'ratelimit:save-position:user-1:203.0.113.7',
    60
  ]);
  assert.equal(calls.filter((call) => call.command === 'incr' || call.command === 'expire').length, 0);
});

test('frontend API helper keeps backend calls relative', () => {
  const apiContent = fs.readFileSync(path.resolve(__dirname, '../src/utils/api.js'), 'utf8');
  const futuresContent = fs.readFileSync(path.resolve(__dirname, '../src/engines/futuresEngine.js'), 'utf8');
  assert.match(apiContent, /function apiFetch/);
  assert.doesNotMatch(futuresContent, /https:\/\/polytoolbtc\.vercel\.app\/api\//);
  const { normalizeApiPath } = require('../src/utils/api.js');
  assert.equal(normalizeApiPath('save-position'), '/api/save-position');
  assert.equal(normalizeApiPath('/api/delete-position'), '/api/delete-position');
});

test('logout clears masako localStorage before Supabase signOut and reload', () => {
  const authContent = fs.readFileSync(path.resolve(__dirname, '../src/auth/googleAuth.js'), 'utf8');
  const removeIndex = authContent.indexOf('windowObj.localStorage.removeItem');
  const supabaseSignOutIndex = authContent.indexOf('AuthState.client.auth.signOut');
  const reloadIndex = authContent.indexOf('windowObj.location.reload');
  assert.ok(removeIndex > -1);
  assert.ok(removeIndex < supabaseSignOutIndex);
  assert.ok(supabaseSignOutIndex < reloadIndex);
});

test('telemetry endpoint is rate limited', async () => {
  const telemetryPath = path.resolve(__dirname, '../api/telemetry.js');
  const ratePath = path.resolve(__dirname, '../api/_rateLimit.js');
  delete require.cache[telemetryPath];
  require.cache[ratePath] = {
    id: ratePath,
    filename: ratePath,
    loaded: true,
    exports: {
      checkRateLimit: async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 }),
      applyRateLimitHeaders: () => {}
    }
  };
  const handler = require(telemetryPath);
  const res = { headers: {}, statusCode: 200, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body: { event: 'pair_fetch_repeated_failure', pair: 'BTCUSDT' }, socket: {} }, res);
  assert.equal(res.statusCode, 429);
});

test('XSS payloads are escaped before dynamic HTML can render them', () => {
  const { escapeHTML } = require('../src/utils/storage.js');
  const payload = '<img src=x onerror=globalThis.__xss=1>';
  assert.equal(escapeHTML(payload).includes('<img'), false);
  const futuresContent = fs.readFileSync(path.resolve(__dirname, '../src/engines/futuresEngine.js'), 'utf8');
  assert.match(futuresContent, /createUiElement\('span', \{ className: 'position-pair', text: pos\.pair \}\)/);
  assert.match(futuresContent, /createUiElement\('span', \{ className: `position-side/);
  assert.doesNotMatch(futuresContent, /wrapper\.innerHTML = activeInPair\.map/);
});


test('action modal content is built with DOM APIs instead of innerHTML templates', () => {
  const mainContent = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
  assert.match(mainContent, /function createPartialCloseModalBody/);
  assert.match(mainContent, /function createEditTpSlModalBody/);
  assert.match(mainContent, /replaceChildrenById\('action-modal-body', createPartialCloseModalBody\(\)\)/);
  assert.match(mainContent, /replaceChildrenById\('action-modal-body', createEditTpSlModalBody\(id, pos\)\)/);
  assert.doesNotMatch(mainContent, /action-modal-body'\)\.innerHTML\s*=/);
});

test('CDN SRI verifier tracks external browser SDK assets', () => {
  const verifierContent = fs.readFileSync(path.resolve(__dirname, '../tools/verify-cdn-sri.mjs'), 'utf8');
  assert.match(verifierContent, /lightweight-charts@4\.1\.1\/dist\/lightweight-charts\.standalone\.production\.js/);
  assert.match(verifierContent, /@supabase\/supabase-js@2\.45\.4/);
  assert.match(verifierContent, /createHash\('sha384'\)/);
  assert.match(verifierContent, /crossorigin="anonymous"/);
});
