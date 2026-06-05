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
