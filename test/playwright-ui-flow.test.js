const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { extname, join, normalize } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = join(__dirname, '..');
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

async function loadPlaywright(t) {
  try {
    return await import('playwright');
  } catch (error) {
    t.skip(`Playwright dependency is not installed: ${error.message}`);
    return null;
  }
}

function createStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const requested = url.pathname === '/' ? '/index.html' : url.pathname;
      const normalized = normalize(requested).replace(/^[/\\]+/, '');
      if (normalized.startsWith('..')) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(join(ROOT, normalized));
      res.writeHead(200, { 'Content-Type': MIME.get(extname(normalized)) || 'application/octet-stream' });
      res.end(body);
    } catch (error) {
      res.writeHead(404).end(error.message);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('Playwright browser runner loads the real UI and exercises action modal builders', async (t) => {
  const playwright = await loadPlaywright(t);
  if (!playwright) return;

  const { server, port } = await createStaticServer();
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    server.close();
    t.skip(`Playwright Chromium browser is not available: ${error.message}`);
    return;
  }

  try {
    const page = await browser.newPage();
    await page.route('https://unpkg.com/**', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: 'window.LightweightCharts = { createChart: () => ({ addCandlestickSeries: () => ({}), addLineSeries: () => ({}), timeScale: () => ({ fitContent() {}, scrollToRealTime() {} }), applyOptions() {}, remove() {} }) };'
    }));
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: 'window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithOAuth: async () => ({}), signOut: async () => ({}) } } }) };'
    }));
    await page.route('https://api.binance.com/**', (route) => route.fulfill({
      contentType: 'application/json',
      body: '[]'
    }));
    await page.route('https://fapi.binance.com/**', (route) => route.fulfill({
      contentType: 'application/json',
      body: '[]'
    }));

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#action-modal');

    await page.evaluate(() => {
      window.AppState.actionPosId = null;
      window.FuturesEngine.state.positions = [{
        id: 42,
        pair: 'BTCUSDT',
        type: 'LONG',
        entryPrice: 100,
        tp: 120,
        sl: 90,
        leverage: 10,
        margin: 100,
        marginMode: 'ISOLATED',
        sizeBase: 10,
        autoHedgeTrail: true,
        tsCallback: 1.5
      }];
      window.openPartialCloseModal(42);
    });

    await assertElementText(page, '#action-modal-title', 'Tutup Posisi (Sebagian / Semua)');
    assert.equal(await page.locator('#partial-close-slider').inputValue(), '100');
    await page.locator('[data-partial-close-pct="25"]').click();
    assert.equal(await page.locator('#partial-close-slider').inputValue(), '25');
    await assertElementText(page, '#partial-close-val', '25%');

    await page.evaluate(() => window.openEditTpSlModal(42));
    await assertElementText(page, '#action-modal-title', 'Edit TP / SL Posisi Aktif');
    assert.equal(await page.locator('#edit-tp-val').inputValue(), '120');
    assert.equal(await page.locator('#edit-sl-val').inputValue(), '90');
    assert.equal(await page.locator('#edit-hedge-ts').isChecked(), true);
    assert.equal(await page.locator('[data-action="auto-tpsl"]').getAttribute('data-position-id'), '42');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});

async function assertElementText(page, selector, expected) {
  assert.equal((await page.locator(selector).textContent()).trim(), expected);
}
