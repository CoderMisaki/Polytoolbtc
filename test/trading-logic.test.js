const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldClosePosition } = require('../api/cron-check');
const { calculatePnl } = require('../src/utils/trading');

test('shouldClosePosition LONG kena SL', () => {
  assert.equal(shouldClosePosition({ type: 'LONG', sl: 90, tp: 120 }, 89), 'STOP LOSS');
});

test('shouldClosePosition LONG kena TP', () => {
  assert.equal(shouldClosePosition({ type: 'LONG', sl: 90, tp: 120 }, 121), 'TAKE PROFIT');
});

test('shouldClosePosition SHORT kena SL', () => {
  assert.equal(shouldClosePosition({ type: 'SHORT', sl: 110, tp: 80 }, 111), 'STOP LOSS');
});

test('shouldClosePosition SHORT kena TP', () => {
  assert.equal(shouldClosePosition({ type: 'SHORT', sl: 110, tp: 80 }, 79), 'TAKE PROFIT');
});

test('shouldClosePosition tetap terbuka jika belum kena SL/TP', () => {
  assert.equal(shouldClosePosition({ type: 'LONG', sl: 90, tp: 120 }, 100), null);
  assert.equal(shouldClosePosition({ type: 'SHORT', sl: 110, tp: 80 }, 100), null);
});

test('calculatePnl menghitung LONG/SHORT', () => {
  assert.equal(calculatePnl({ type: 'LONG', entryPrice: 100, sizeBase: 2 }, 110), 20);
  assert.equal(calculatePnl({ type: 'SHORT', entryPrice: 100, sizeBase: 2 }, 90), 20);
});
