const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ALLOWED_PAIRS, ALLOWED_PAIR_SET, DEFAULT_PAIR } = require('../shared/pairs');
const { ALLOWED_PAIRS: VALIDATION_ALLOWED_PAIRS } = require('../api/_validation');

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
