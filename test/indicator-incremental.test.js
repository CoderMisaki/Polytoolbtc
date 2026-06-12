const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createIndicatorBuckets() {
  return {
    e21: [], e55: [], e200: [],
    stUp: [], stDown: [], st: [], vwap: [],
    rsi: [], rsi21: [], stochK: [], stochD: [], wr: [], adx: [], macd: [],
    bb: [], donchian: [], obv: [], cvd: [], psar: [], mfi: [], linreg: [],
    volosc: [], ichimoku: [], pivots: [], poc: []
  };
}

function createContext() {
  const context = {
    AppState: {
      candles: [],
      indicators: createIndicatorBuckets(),
      indicatorState: null,
      volSMA: [],
      atrSMA: [],
      swings: { highs: [], lows: [] },
      g_tf: '15m'
    },
    rsiLookupByTime: new Map(),
    safeDiv: (a, b) => (b === 0 ? 0 : a / b)
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.resolve(__dirname, '../src/indicators/math.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'src/indicators/math.js' });
  return context;
}

function syntheticCandles(length) {
  const candles = [];
  let close = 10_000;
  for (let i = 0; i < length; i++) {
    close += Math.sin(i / 5) * 35 + Math.cos(i / 13) * 18 + ((i % 9) - 4) * 2.7;
    const open = close - Math.sin(i / 3) * 12;
    const high = Math.max(open, close) + 20 + (i % 7);
    const low = Math.min(open, close) - 18 - (i % 5);
    candles.push({
      time: 1_700_000_000 + i * 900,
      open,
      high,
      low,
      close,
      vol: 100 + (i % 11) * 9 + Math.abs(Math.sin(i / 4)) * 25,
      takerVol: 45 + (i % 7) * 5
    });
  }
  return candles;
}

function resetForIncremental(context) {
  context.AppState.candles = [];
  context.AppState.indicators = createIndicatorBuckets();
  context.AppState.indicatorState = null;
  context.AppState.volSMA = [];
  context.AppState.atrSMA = [];
  context.AppState.swings = { highs: [], lows: [] };
  context.rsiLookupByTime.clear();
}

function assertSeriesClose(actual, expected, label, fields = ['value']) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i].time, expected[i].time, `${label}[${i}].time`);
    for (const field of fields) {
      assert.ok(
        Math.abs(actual[i][field] - expected[i][field]) < 1e-9,
        `${label}[${i}].${field}: expected ${expected[i][field]}, got ${actual[i][field]}`
      );
    }
  }
}

test('calculateIndicatorsIncremental matches full EMA/MACD/RSI calculation on synthetic candles', () => {
  const context = createContext();
  const candles = syntheticCandles(260);
  resetForIncremental(context);

  for (const candle of candles) {
    context.AppState.candles.push(candle);
    context.calculateIndicatorsIncremental();
  }

  assertSeriesClose(context.AppState.indicators.e21, context.calcEMA(candles, 21, 'close'), 'EMA21');
  assertSeriesClose(context.AppState.indicators.e55, context.calcEMA(candles, 55, 'close'), 'EMA55');
  assertSeriesClose(context.AppState.indicators.e200, context.calcEMA(candles, 200, 'close'), 'EMA200');
  assertSeriesClose(context.AppState.indicators.rsi, context.calcRSI(candles, 14), 'RSI14');
  assertSeriesClose(context.AppState.indicators.rsi21, context.calcRSI(candles, 21), 'RSI21');
  assertSeriesClose(context.AppState.indicators.macd, context.calcMACD(candles, 12, 26, 9), 'MACD', ['value', 'macd', 'signal']);

  assert.equal(context.AppState.indicatorState.length, candles.length);
  assert.equal(context.AppState.indicatorState.lastTime, candles[candles.length - 1].time);
  assert.equal(context.rsiLookupByTime.get(candles[candles.length - 1].time), context.AppState.indicators.rsi.at(-1).value);
});

test('calculateIndicatorsIncremental recomputes a live last-candle replacement from saved explicit state', () => {
  const context = createContext();
  const candles = syntheticCandles(180);
  resetForIncremental(context);

  for (const candle of candles) {
    context.AppState.candles.push({ ...candle });
    context.calculateIndicatorsIncremental();
  }

  const replacement = {
    ...candles[candles.length - 1],
    close: candles[candles.length - 1].close + 123.45,
    high: candles[candles.length - 1].high + 130,
    vol: candles[candles.length - 1].vol + 77
  };
  context.AppState.candles[context.AppState.candles.length - 1] = replacement;
  context.calculateIndicatorsIncremental();

  const replacedCandles = candles.slice(0, -1).concat(replacement);
  assertSeriesClose(context.AppState.indicators.e21, context.calcEMA(replacedCandles, 21, 'close'), 'EMA21 replaced');
  assertSeriesClose(context.AppState.indicators.rsi, context.calcRSI(replacedCandles, 14), 'RSI14 replaced');
  assertSeriesClose(context.AppState.indicators.macd, context.calcMACD(replacedCandles, 12, 26, 9), 'MACD replaced', ['value', 'macd', 'signal']);
});
