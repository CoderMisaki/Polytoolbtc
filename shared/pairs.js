(function attachPairWhitelist(root, factory) {
  const whitelist = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = whitelist;
  }
  if (root) {
    root.MASAKO_ALLOWED_PAIRS = whitelist.ALLOWED_PAIRS.slice();
    root.MASAKO_DEFAULT_PAIR = whitelist.DEFAULT_PAIR;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPairWhitelist() {
  const ALLOWED_PAIRS = Object.freeze([
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'DOGEUSDT',
    'XRPUSDT',
    'PEPEUSDT',
    'SHIBUSDT',
    'WIFUSDT'
  ]);

  return Object.freeze({
    ALLOWED_PAIRS,
    DEFAULT_PAIR: ALLOWED_PAIRS[0],
    ALLOWED_PAIR_SET: new Set(ALLOWED_PAIRS)
  });
});
