const test = require('node:test');
const assert = require('node:assert/strict');

if (!global.window) global.window = {};
const { formatPrice } = require('../src/utils/format');
const { safeLoad, safeStore } = require('../src/utils/storage');

test('format price', () => {
  assert.equal(formatPrice(12345.678), '12345.68');
  assert.equal(formatPrice(0.000012345), '0.00001234');
  assert.equal(formatPrice('not-number'), '0');
});

test('storage fallback ketika localStorage tidak tersedia', () => {
  delete global.localStorage;
  assert.deepEqual(safeLoad('missing', { ok: true }), { ok: true });
  assert.doesNotThrow(() => safeStore('x', { ok: true }));
});
