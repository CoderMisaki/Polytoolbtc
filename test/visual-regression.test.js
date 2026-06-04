const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const CSS_PATH = 'assets/styles/main.css';
const INDEX_PATH = 'index.html';

function readAppFixture() {
    const css = readFileSync(CSS_PATH, 'utf8');
    const index = readFileSync(INDEX_PATH, 'utf8');
    const body = index.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
    const staticBody = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${staticBody}</body></html>`;
}

function findBrowserExecutable() {
    const candidates = [
        process.env.CHROME_BIN,
        process.env.CHROMIUM_BIN,
        process.env.BROWSER,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        'google-chrome-stable',
        'google-chrome',
        'chromium-browser',
        'chromium'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (candidate.includes('/') && !existsSync(candidate)) continue;
        const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
        if (probe.status === 0) return candidate;
    }
    return null;
}

async function waitForJsonVersion(port, signal) {
    const endpoint = `http://127.0.0.1:${port}/json/version`;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 7000) {
        if (signal.aborted) throw new Error('Browser process exited before DevTools became available');
        try {
            const response = await fetch(endpoint);
            if (response.ok) return response.json();
        } catch {
            // Retry until Chrome has opened the remote-debugging port.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for browser DevTools endpoint');
}

class CdpClient {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.events = new Map();
        ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
                else resolve(message.result || {});
                return;
            }
            const listeners = this.events.get(message.method) || [];
            for (const listener of listeners) listener(message.params || {});
        });
    }

    static connect(url) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            const timer = setTimeout(() => reject(new Error('Timed out connecting to DevTools WebSocket')), 5000);
            ws.addEventListener('open', () => {
                clearTimeout(timer);
                resolve(new CdpClient(ws));
            }, { once: true });
            ws.addEventListener('error', () => {
                clearTimeout(timer);
                reject(new Error('DevTools WebSocket connection failed'));
            }, { once: true });
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        const payload = JSON.stringify({ id, method, params });
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(payload);
        });
    }

    once(method) {
        return new Promise((resolve) => {
            const listener = (params) => {
                this.events.set(method, (this.events.get(method) || []).filter((item) => item !== listener));
                resolve(params);
            };
            this.events.set(method, [...(this.events.get(method) || []), listener]);
        });
    }

    close() {
        this.ws.close();
    }
}

async function withBrowserPage(t, run) {
    const browser = findBrowserExecutable();
    if (!browser) {
        t.skip('No Chromium/Chrome runtime detected in CI; skipping browser-backed visual regression.');
        return;
    }

    const port = 9222 + Math.floor(Math.random() * 1000);
    const userDataDir = await mkdtemp(join(tmpdir(), 'masako-visual-'));
    const controller = new AbortController();
    const child = spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        'about:blank'
    ], { stdio: 'ignore' });

    child.once('exit', () => controller.abort());

    let page;
    try {
        await waitForJsonVersion(port, controller.signal);
        const pageResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
        assert.equal(pageResponse.ok, true, 'DevTools should create a blank test page');
        const pageInfo = await pageResponse.json();
        page = await CdpClient.connect(pageInfo.webSocketDebuggerUrl);
        await run(page);
    } finally {
        if (page) page.close();
        child.kill('SIGTERM');
        await rm(userDataDir, { recursive: true, force: true });
    }
}

test('compact control sizing is centralized in CSS tokens', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    assert.match(css, /--control-height-sm:\s*26px;/);
    assert.match(css, /--control-height-md:\s*32px;/);
    assert.match(css, /height:\s*var\(--control-height-sm\)/);
    assert.match(css, /min-height:\s*var\(--control-height-md\)/);
    assert.doesNotMatch(css, /min-height:\s*36px;/, 'avoid broad mobile min-height overrides that resize every terminal control');
});

test('mobile header and Futures panel stay compact when CI has a browser runtime', { skip: !process.env.CI }, async (t) => {
    await withBrowserPage(t, async (page) => {
        const html = readAppFixture();
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: true
        });
        const loaded = page.once('Page.loadEventFired');
        await page.send('Page.navigate', { url: dataUrl });
        await loaded;

        const { result } = await page.send('Runtime.evaluate', {
            returnByValue: true,
            expression: `(() => {
                const rect = (el) => {
                    const r = el.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
                };
                const header = document.querySelector('.header');
                const futuresCard = [...document.querySelectorAll('.card')].find((card) => card.textContent.includes('Futures Execution'));
                const headerControls = [...document.querySelectorAll('.header select, .header .btn, .header .btn-icon')].map(rect);
                const futuresControls = futuresCard ? [...futuresCard.querySelectorAll('select, input[type="number"], .btn, .tab-btn, .ai-mode-btn, .leverage-control')].map(rect) : [];
                const visible = [...document.body.querySelectorAll('*')].filter((el) => {
                    const style = getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                }).map(rect);
                return {
                    viewportWidth: window.innerWidth,
                    documentScrollWidth: document.documentElement.scrollWidth,
                    header: rect(header),
                    futuresCard: futuresCard ? rect(futuresCard) : null,
                    headerControls,
                    futuresControls,
                    maxVisibleRight: Math.max(...visible.map((r) => r.right))
                };
            })()`
        });
        const metrics = result.value;

        assert.ok(metrics.futuresCard, 'Futures Execution card should be present in the mobile fixture');
        assert.ok(metrics.header.height <= 76, `mobile header grew too tall: ${metrics.header.height}px`);
        assert.ok(metrics.headerControls.every((control) => control.height <= 32), 'header controls should use compact mobile token heights');
        assert.ok(metrics.futuresControls.every((control) => control.height <= 34), 'Futures panel controls should remain compact');
        assert.ok(metrics.documentScrollWidth <= metrics.viewportWidth, `document overflows horizontally: ${metrics.documentScrollWidth}px > ${metrics.viewportWidth}px`);
        assert.ok(metrics.maxVisibleRight <= metrics.viewportWidth + 1, `visible content overflows mobile viewport: ${metrics.maxVisibleRight}px`);

        const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        assert.ok(Buffer.from(screenshot.data, 'base64').length > 1000, 'mobile visual smoke screenshot should be non-empty');
    });
});
