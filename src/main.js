function getMarketSession() { 
    const h = new Date().getUTCHours(); 
    if (h >= 13 && h < 16) return "LONDON + NEW YORK"; 
    if (h >= 8 && h < 13) return "LONDON"; 
    if (h >= 16 && h < 21) return "NEW YORK"; 
    return "ASIAN"; 
}

let globalAlertHideTimer = null;
let globalAlertTargetPair = null;
const boundGlobalAlertElements = new WeakSet();

function handleGlobalAlertClick() {
    if (!globalAlertTargetPair) return;
    const pairSelect = document.getElementById('pair');
    if (!pairSelect) return;
    pairSelect.value = globalAlertTargetPair;
    changeConfig();
}

function ensureGlobalAlertClickHandler(alertElement) {
    if (boundGlobalAlertElements.has(alertElement)) return;
    alertElement.addEventListener('click', handleGlobalAlertClick);
    boundGlobalAlertElements.add(alertElement);
}

function triggerGlobalAlertIfNeeded() { 
    const a = document.getElementById('global-pos-alert'); 
    if (!a) return;
    ensureGlobalAlertClickHandler(a);
    const o = FuturesEngine.state.positions.find(p => p.pair !== AppState.g_pair); 
    if (globalAlertHideTimer) {
        clearTimeout(globalAlertHideTimer);
        globalAlertHideTimer = null;
    }
    if (o) { 
        globalAlertTargetPair = o.pair;
        a.innerText = `⚠️ Ada Posisi Aktif di ${o.pair} (Klik untuk pindah)`; 
        a.classList.remove('is-hidden'); 
        globalAlertHideTimer = setTimeout(() => {
            a.classList.add('is-hidden');
        }, 2000);
    } else { 
        globalAlertTargetPair = null;
        a.classList.add('is-hidden'); 
    }
}

function updateEquityDisplay() { 
    let eq = FuturesEngine.state.balance;
    let unPnl = 0; 
    if (FuturesEngine.state.positions && FuturesEngine.state.positions.length > 0) { 
        FuturesEngine.state.positions.forEach((p) => { 
            if (p.marginMode === 'ISOLATED') {
                eq += p.margin; 
            }
            let cP = (p.pair === AppState.g_pair) ? AppState.price : (AppState.lastPrices[p.pair] || p.entryPrice); 
            if (cP > 0) { 
                let rawPnl = p.type === 'LONG' ? (cP - p.entryPrice) * p.sizeBase : (p.entryPrice - cP) * p.sizeBase; 
                unPnl += rawPnl; 
            } 
        }); 
    } 
    eq += unPnl; 
    setSafeText('demo-balance', `$${eq.toFixed(2)}`); 
}



function setChartLoading(active, message = "Memuat chart...") {
    const loadingEl = document.getElementById('chart-loading');
    const textEl = document.getElementById('chart-loading-text');
    if (textEl && message) textEl.innerText = message;
    if (!loadingEl) return;
    loadingEl.classList.toggle('active', !!active);
}

function updateFeedStatus(info = {}) {
    const feed = AppState.feed || {};
    const active = info.activeSource || feed.activeVenue || 'BINANCE';
    const latency = Number.isFinite(info.latencyMs) ? info.latencyMs : (Number.isFinite(feed.latencyMs) ? feed.latencyMs : 0);
    const spread = Number.isFinite(info.spreadPct) ? info.spreadPct : (Number.isFinite(feed.spreadPct) ? feed.spreadPct : 0);
    const isError = info.status === 'ERROR' || feed.status === 'ERROR';
    const sourceText = isError ? `${active} ERROR` : (active ? `${active}` : '-');
    const latencyText = Number.isFinite(latency) ? `${Math.max(0, Math.round(latency))}ms` : '—';
    setSafeText('badge-source', `Feed: ${sourceText}`);
    setSafeText('badge-latency', latencyText);
    const sourceBadge = document.getElementById('badge-source');
    const latencyBadge = document.getElementById('badge-latency');
    if (sourceBadge) {
        sourceBadge.classList.remove('badge-source-error', 'badge-source-bybit', 'badge-source-default');
        sourceBadge.classList.add(isError ? 'badge-source-error' : (active === 'BYBIT' ? 'badge-source-bybit' : 'badge-source-default'));
        if (info.error) sourceBadge.title = info.error;
    }
    if (latencyBadge) {
        latencyBadge.classList.remove('badge-latency-high', 'badge-latency-med', 'badge-latency-low');
        latencyBadge.classList.add(latency > 1200 ? 'badge-latency-high' : (latency > 500 ? 'badge-latency-med' : 'badge-latency-low'));
    }
    feed.activeVenue = active;
    feed.primaryVenue = active;
    feed.secondaryVenue = active === 'BINANCE' ? 'BYBIT' : 'BINANCE';
    feed.latencyMs = latency;
    feed.spreadPct = spread;
    feed.lastUpdate = Date.now();
    feed.status = info.status || feed.status || 'LIVE';
    if (info.error) feed.lastError = info.error;
    feed.sourceStatus = {
        BINANCE: info.binance?.status || feed.sourceStatus?.BINANCE || 'DISCONNECTED',
        BYBIT: info.bybit?.status || feed.sourceStatus?.BYBIT || 'DISCONNECTED'
    };
    AppState.feed = feed;
}

function updatePolyButtons() { 
    const p5 = polymarketLog.some((p) => p.status === 'PENDING' && p.pair === AppState.g_pair && p.tfLabel === '5m');
    const p15 = polymarketLog.some((p) => p.status === 'PENDING' && p.pair === AppState.g_pair && p.tfLabel === '15m');
    const b5 = document.getElementById('btn-poly-5');
    const b15 = document.getElementById('btn-poly-15'); 
    let b = AppState.g_base || "COIN"; 
    
    if (b5) { 
        b5.disabled = p5; 
        b5.innerText = p5 ? '5m (Run)' : `Predict 5M ${b}`; 
    } 
    if (b15) { 
        b15.disabled = p15; 
        b15.innerText = p15 ? '15m (Run)' : `Predict 15M ${b}`; 
    } 
}



function createModalElement(tag, { className = '', text = '', attrs = {}, checked = undefined } = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    if (checked !== undefined) element.checked = !!checked;
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        element.setAttribute(key, String(value));
    });
    return element;
}

function appendModalChildren(parent, children) {
    children.filter(Boolean).forEach((child) => parent.appendChild(child));
    return parent;
}

function replaceChildrenById(id, children) {
    const element = document.getElementById(id);
    if (!element) return null;
    element.replaceChildren(...children.filter(Boolean));
    return element;
}

function createModalInputField({ wrapperClass = 'modal-field', label, inputAttrs = {}, value = '' }) {
    const input = createModalElement('input', { attrs: inputAttrs });
    input.value = value === undefined || value === null ? '' : String(value);
    return appendModalChildren(createModalElement('div', { className: wrapperClass }), [
        createModalElement('label', { className: 'modal-label', text: label }),
        input
    ]);
}

function createPartialCloseModalBody() {
    const slider = createModalElement('input', {
        className: 'partial-slider',
        attrs: { type: 'range', id: 'partial-close-slider', min: '1', max: '100', value: '100' }
    });
    const sliderRow = appendModalChildren(createModalElement('div', { className: 'partial-slider-row' }), [
        slider,
        createModalElement('span', { className: 'partial-value', text: '100%', attrs: { id: 'partial-close-val' } })
    ]);
    const percentageButtons = appendModalChildren(createModalElement('div', { className: 'btn-group modal-field' }), [
        createModalElement('button', { className: 'btn btn-secondary', text: '10%', attrs: { type: 'button', 'data-partial-close-pct': '10' } }),
        createModalElement('button', { className: 'btn btn-secondary', text: '25%', attrs: { type: 'button', 'data-partial-close-pct': '25' } }),
        createModalElement('button', { className: 'btn btn-secondary', text: '50%', attrs: { type: 'button', 'data-partial-close-pct': '50' } }),
        createModalElement('button', { className: 'btn btn-secondary', text: 'All', attrs: { type: 'button', 'data-partial-close-pct': '100' } })
    ]);
    return [
        appendModalChildren(createModalElement('div', { className: 'modal-field' }), [
            createModalElement('label', { className: 'modal-label', text: 'Persentase Penutupan (%)' }),
            sliderRow
        ]),
        percentageButtons,
        createModalElement('button', {
            className: 'btn btn-danger w-100',
            text: 'Konfirmasi Tutup',
            attrs: { type: 'button', 'data-action': 'partial-close-confirm' }
        })
    ];
}

function createEditTpSlModalBody(id, pos) {
    const hedgeCheckbox = createModalElement('input', {
        checked: !!pos.autoHedgeTrail,
        attrs: { type: 'checkbox', id: 'edit-hedge-ts' }
    });
    return [
        createModalElement('button', {
            className: 'btn btn-secondary w-100 modal-field text-warning',
            text: '✨ Hitung Otomatis TP/SL (ATR Base)',
            attrs: { type: 'button', 'data-action': 'auto-tpsl', 'data-position-id': id }
        }),
        createModalInputField({
            wrapperClass: 'modal-field-sm',
            label: 'Target Price (TP)',
            inputAttrs: { type: 'number', id: 'edit-tp-val', placeholder: 'Masukkan TP valid' },
            value: pos.tp || ''
        }),
        createModalInputField({
            label: 'Stop Loss Price (SL)',
            inputAttrs: { type: 'number', id: 'edit-sl-val', placeholder: 'Masukkan SL valid' },
            value: pos.sl || ''
        }),
        appendModalChildren(createModalElement('label', { className: 'checkbox-container modal-field-sm' }), [
            hedgeCheckbox,
            createModalElement('span', { text: 'Automatic Hedging Trailing Stop' })
        ]),
        createModalInputField({
            label: 'Hedge Callback %',
            inputAttrs: { type: 'number', id: 'edit-hedge-callback', placeholder: 'Contoh: 1' },
            value: pos.tsCallback || ''
        }),
        createModalElement('button', {
            className: 'btn btn-primary w-100',
            text: 'Simpan Pembaruan',
            attrs: { type: 'button', 'data-action': 'save-tpsl' }
        })
    ];
}

const MarketFeed = window.MarketFeedManager ? new window.MarketFeedManager() : null;
window.MarketFeed = MarketFeed;
if (MarketFeed) {
    MarketFeed.setCallbacks({
        onTick: (candle, meta) => updateLiveTick(candle, meta),
        onStatus: (meta) => updateFeedStatus(meta)
    });
}

window.logPolymarketAction = function(minutes) {

    if (!AppState.price) return;
    
    if (polymarketLog.some(p => p.status === 'PENDING' && p.pair === AppState.g_pair && p.tfLabel === minutes+'m')) { 
        showToast("Masih ada prediksi aktif di timeframe ini.", true); 
        return; 
    }
    
    let direction = AppState.live.signal === 'STRONG SELL' ? 'SHORT' : (AppState.live.signal === 'STRONG BUY' ? 'LONG' : null);
    
    if (!direction) { 
        if (AppState.aiMode === 'AGG') { 
            direction = AppState.live.score >= 0 ? 'LONG' : 'SHORT'; 
            showToast("Polymarket: mode agresif membuat simulasi arah berdasarkan skor saat ini.", false); 
        } else { 
            showToast("Polymarket: Tunggu sinyal kuat AI atau ubah mode.", true); 
            return; 
        } 
    }
    
    const p = { 
        id: Date.now(), 
        pair: AppState.g_pair, 
        tfLabel: minutes+'m', 
        direction: direction, 
        startPrice: AppState.price, 
        requestTime: Math.floor(Date.now() / 1000), 
        targetTime: Math.floor(Date.now() / 1000) + (minutes * 60), 
        status: 'PENDING' 
    };
    
    polymarketLog.push(p); 
    if (polymarketLog.length > 200) polymarketLog = polymarketLog.slice(-200);
    
    saveState(); 
    PolyLineManager.draw(p); 
    updatePolyButtons(); 
    updateLedgerUI(); 
    showToast(`Polymarket: Prediksi ${minutes}m ${direction} dicatat!`);
};

window.cancelPrediction = function(id) { 
    const p = polymarketLog.find(x => x.id === id); 
    if (p && p.status === 'PENDING') { 
        p.status = 'CANCELLED'; 
        PolyLineManager.remove(id); 
        saveState(); 
        updatePolyButtons(); 
        updateLedgerUI(); 
        showToast("Prediksi Polymarket dibatalkan."); 
    } 
};

window.closeActionModal = function(f) { 
    const modal = document.getElementById('action-modal'); 
    if (f === true || (f && f.target && f.target.id === 'action-modal')) { 
        modal.classList.remove('active'); 
        AppState.actionPosId = null; 
    } 
};

window.openPartialCloseModal = function(id) {
    AppState.actionPosId = id; 
    document.getElementById('action-modal-title').innerText = "Tutup Posisi (Sebagian / Semua)";
    replaceChildrenById('action-modal-body', createPartialCloseModalBody());
    document.getElementById('action-modal').classList.add('active');
}

window.executePartialClose = function() { 
    let pct = parseFloat(document.getElementById('partial-close-slider').value); 
    if (isNaN(pct) || pct <= 0 || pct > 100) { 
        showToast("Persentase maksimal 100%", true); 
        return; 
    } 
    FuturesEngine.closePosition(AppState.actionPosId, false, "CLOSED", pct); 
    FuturesEngine.updateUI();
    updateEquityDisplay();
    updateLedgerUI();
    if (typeof scheduleChartRender === 'function') scheduleChartRender();
    closeActionModal(true); 
}

window.openEditTpSlModal = function(id) {
    AppState.actionPosId = id; 
    let pos = FuturesEngine.state.positions.find(p => p.id === id); 
    if (!pos) return;
    
    document.getElementById('action-modal-title').innerText = "Edit TP / SL Posisi Aktif";
    replaceChildrenById('action-modal-body', createEditTpSlModalBody(id, pos));
    document.getElementById('action-modal').classList.add('active');
}

window.autoCalculateTpSl = function(id) {
    let pos = FuturesEngine.state.positions.find(p => p.id === id); 
    if (!pos) return;
    
    let atr = AppState.live.atr || (pos.entryPrice * 0.01);
    let tp = pos.type === 'LONG' ? pos.entryPrice + (atr * 2) : pos.entryPrice - (atr * 2);
    let sl = pos.type === 'LONG' ? pos.entryPrice - atr : pos.entryPrice + atr;
    
    document.getElementById('edit-tp-val').value = formatPriceInput(tp); 
    document.getElementById('edit-sl-val').value = formatPriceInput(sl); 
    showToast("Hitung otomatis berhasil (Risk 1 : 2 Reward)");
}

window.executeEditTpSl = function() {
    let tpInput = document.getElementById('edit-tp-val').value;
    let tp = tpInput === "" ? null : parseFloat(tpInput);
    
    let slInput = document.getElementById('edit-sl-val').value;
    let sl = slInput === "" ? null : parseFloat(slInput);
    
    let hedgeEnabledEl = document.getElementById('edit-hedge-ts');
    let hedgeCallbackEl = document.getElementById('edit-hedge-callback');
    let pos = FuturesEngine.state.positions.find(p => p.id === AppState.actionPosId);
    
    if (pos) { 
        if (tp === null) pos.tp = null;
        else if (!isNaN(tp) && tp > 0) pos.tp = tp;
        if (sl === null) pos.sl = null;
        else if (!isNaN(sl) && sl > 0) pos.sl = sl;
        pos.autoHedgeTrail = !!(hedgeEnabledEl && hedgeEnabledEl.checked);
        const hedgeCallback = hedgeCallbackEl ? parseFloat(hedgeCallbackEl.value) : NaN;
        
        if (!isNaN(hedgeCallback) && hedgeCallback > 0) {
            pos.tsCallback = hedgeCallback;
            if (pos.autoHedgeTrail) {
                let mates = FuturesEngine.state.positions.filter(p => p.pair === pos.pair && p.type !== pos.type && p.autoHedgeTrail);
                mates.forEach(mate => mate.tsCallback = hedgeCallback);
            }
        }
        
        pos.hedgeLinked = false;
        pos.tsIsActive = false;
        pos.tsExtremePrice = pos.type === 'LONG' ? Math.max(pos.entryPrice, AppState.price || pos.entryPrice) : Math.min(pos.entryPrice, AppState.price || pos.entryPrice);
        FuturesEngine.save(); 
        FuturesEngine.syncUpdatePosition(pos);
        
        if (pos.autoHedgeTrail) {
            FuturesEngine.syncHedgeTrailingState(pos, AppState.price || pos.entryPrice);
        }
        showToast("TP/SL & Hedging Berhasil Diperbarui!"); 
    }
    closeActionModal(true);
}



function initApp() {
    const savedPair = localStorage.getItem('masako_pref_pair');
    const savedTf = localStorage.getItem('masako_pref_tf');
    const allowedPairs = Array.isArray(window.MASAKO_ALLOWED_PAIRS) ? window.MASAKO_ALLOWED_PAIRS : ['BTCUSDT'];
    const allowedTfs = ['1m', '5m', '15m', '1h'];
    const savedAiMode = localStorage.getItem('masako_pref_ai_mode') || 'CONS';
    const savedLev = parseInt(localStorage.getItem('masako_pref_leverage') || '25', 10);
    const savedMarginMode = localStorage.getItem('masako_pref_margin_mode') || 'ISOLATED';
    
    const nextPair = allowedPairs.includes(savedPair) ? savedPair : (window.MASAKO_DEFAULT_PAIR || 'BTCUSDT');
    const nextTf = allowedTfs.includes(savedTf) ? savedTf : '15m';
    document.getElementById('pair').value = nextPair;
    document.getElementById('tf').value = nextTf;
    if (isNaN(FuturesEngine.state.balance) || FuturesEngine.state.balance <= 0) { 
        FuturesEngine.state.balance = 10000; FuturesEngine.save(); 
    }
    updateEquityDisplay(); 
    const lev = Number.isFinite(savedLev) ? Math.min(125, Math.max(1, savedLev)) : 25;
    document.getElementById('leverage-slider').value = lev; 
    updateLevUI(lev); 
    document.getElementById('margin-mode').value = ['CROSS', 'ISOLATED'].includes(savedMarginMode) ? savedMarginMode : 'ISOLATED';
    setAiMode(savedAiMode); 
    changeConfig(); 
}

window.setAiMode = function(mode) {
    AppState.aiMode = mode;
    safeStore('masako_pref_ai_mode', mode, APP_SCHEMA_VERSION);
    document.getElementById('mode-cons').classList.toggle('active-cons', mode === 'CONS'); 
    document.getElementById('mode-agg').classList.toggle('active-agg', mode === 'AGG');
    document.getElementById('ai-mode-desc').innerText = mode === 'CONS' ? "Delay Filter ON. Sabar." : "Delay Filter OFF. Agresif.";
};

window.changeConfig = function() {
    AppState.g_pair = document.getElementById('pair').value; 
    AppState.g_tf = document.getElementById('tf').value; 
    AppState.g_base = AppState.g_pair.replace("USDT", "");
    AppState.configSessionId += 1;
    
    safeStore('masako_pref_pair', AppState.g_pair, APP_SCHEMA_VERSION); 
    safeStore('masako_pref_tf', AppState.g_tf, APP_SCHEMA_VERSION);
    safeStore('masako_pref_leverage', document.getElementById('leverage-slider').value, APP_SCHEMA_VERSION);
    safeStore('masako_pref_margin_mode', document.getElementById('margin-mode').value, APP_SCHEMA_VERSION);
    
    AppState.isIntentionalClose = true;
    if (MarketFeed) MarketFeed.stop();
    
    if (AppState.wsKline) { AppState.wsKline.close(); AppState.wsKline = null; }
    if (AppState.reconnectTimer) clearTimeout(AppState.reconnectTimer);
    if (AppState.retryTimer) { clearTimeout(AppState.retryTimer); AppState.retryTimer = null; }
    if (window.mtfTimer) clearInterval(window.mtfTimer);
    
    FuturesEngine.clearChartLines(); 
    FuturesEngine.posLines = {}; 
    series = {};
    candleLookupByTime.clear();
    rsiLookupByTime.clear();
    
    AppState.fusion = null; 
    AppState.price = 0; 
    AppState.venueQuotes = { BINANCE: null, BYBIT: null };
    AppState.feed = { activeVenue: 'BINANCE', primaryVenue: 'BINANCE', secondaryVenue: 'BYBIT', latencyMs: 0, spreadPct: 0, lastUpdate: 0, status: 'WAIT', sourceStatus: { BINANCE: 'DISCONNECTED', BYBIT: 'DISCONNECTED' } };
    AppState.hasMoreHistory = true;
    
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    
    if (chart) { try { chart.remove(); } catch(e){} chart = null; } 
    if (rsiChart) { try { rsiChart.remove(); } catch(e){} rsiChart = null; }
    
    document.getElementById('main-chart').innerHTML = ''; 
    document.getElementById('rsi-chart').innerHTML = '';
    
    AppState.candles = []; 
    AppState.markers = []; 
    AppState.swings = { highs: [], lows: [] };
    
    PolyLineManager.clear(); 
    setupChart(); 
    setChartLoading(true, "Memuat chart...");
    FuturesEngine.updateUI(); 
    updatePolyButtons(); 
    triggerGlobalAlertIfNeeded(); 
    fetchDataAndStart(); 
    
    fetchMTFData();
    window.mtfTimer = setInterval(fetchMTFData, 60000);
};

function saveState() { 
    safeStore('masako_poly_v44', polymarketLog, APP_SCHEMA_VERSION); 
}

window.openModal = function() { 
    document.getElementById('history-modal').classList.add('active'); 
    updateLedgerUI(); 
};

window.closeModal = function(f) { 
    if (f === true || (f && f.target && f.target.id === 'history-modal')) { 
        document.getElementById('history-modal').classList.remove('active'); 
    } 
};

window.handleSetFilter = function(f, el) { 
    AppState.currentFilter = f; 
    document.querySelectorAll('#filter-tabs-modal .tab-btn').forEach(b => b.classList.remove('active')); 
    if (el) el.classList.add('active'); 
    updateLedgerUI(); 
};

window.setFuturesMode = function(mode) {
    document.getElementById('tab-manual').classList.toggle('active', mode === 'MANUAL'); 
    document.getElementById('tab-ai').classList.toggle('active', mode === 'AI');
    document.getElementById('futures-manual-btns').style.display = mode === 'MANUAL' ? 'flex' : 'none'; 
    document.getElementById('manual-tpsl-box').style.display = mode === 'MANUAL' ? 'grid' : 'none';
    document.getElementById('manual-auto-rr-box').style.display = mode === 'MANUAL' ? 'block' : 'none'; 
    document.getElementById('futures-ai-btn').style.display = mode === 'AI' ? 'block' : 'none';
    document.getElementById('ai-controls').style.display = mode === 'AI' ? 'block' : 'none';
};

window.updateLevUI = function(val) { 
    document.getElementById('lev-val').innerText = val + 'x'; 
};


function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}


const PAIR_FETCH_ALERT_THRESHOLD = 3;
const PAIR_FETCH_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

function emitPairFetchAlert(pair, retryCount, failureCount, message) {
    const telemetry = AppState.telemetry || { pairFetchFailures: {}, lastPairFetchAlertAt: {} };
    const now = Date.now();
    const lastAt = telemetry.lastPairFetchAlertAt[pair] || 0;
    if (now - lastAt < PAIR_FETCH_ALERT_COOLDOWN_MS) return;
    telemetry.lastPairFetchAlertAt[pair] = now;
    AppState.telemetry = telemetry;

    const payload = {
        event: 'pair_fetch_repeated_failure',
        pair,
        retryCount,
        failureCount,
        source: 'frontend',
        message
    };

    console.error('[pair-fetch-alert]', payload);
    try {
        const body = JSON.stringify(payload);
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }));
        } else {
            fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
        }
    } catch (err) {
        console.warn('pair fetch telemetry send failed', err);
    }
}

function recordPairFetchFailure(pair, message) {
    const telemetry = AppState.telemetry || { pairFetchFailures: {}, lastPairFetchAlertAt: {} };
    const failures = telemetry.pairFetchFailures || {};
    failures[pair] = (failures[pair] || 0) + 1;
    telemetry.pairFetchFailures = failures;
    telemetry.lastPairFetchAlertAt = telemetry.lastPairFetchAlertAt || {};
    AppState.telemetry = telemetry;

    if (failures[pair] >= PAIR_FETCH_ALERT_THRESHOLD) {
        emitPairFetchAlert(pair, AppState.retryCount, failures[pair], message);
    }
}

function resetPairFetchFailure(pair) {
    const telemetry = AppState.telemetry;
    if (!telemetry || !telemetry.pairFetchFailures) return;
    telemetry.pairFetchFailures[pair] = 0;
}

function markFeedHttpError(message = 'Market data sementara tidak tersedia') {
    const feed = AppState.feed || {};
    feed.status = 'ERROR';
    feed.lastError = message;
    feed.latencyMs = Number.isFinite(feed.latencyMs) ? feed.latencyMs : 0;
    AppState.feed = feed;
    updateFeedStatus({ status: 'ERROR', activeSource: feed.activeVenue || 'BINANCE', latencyMs: feed.latencyMs, error: message });
}

const ExchangeEngine = {
    async fetchAll() {
        const reqPair = AppState.g_pair;
        try {
            const sym = reqPair;
            const [fundRes, oiRes, globRes, topRes, takerRes, exInfoRes] = await Promise.all([
                fetchWithTimeout(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`), 
                fetchWithTimeout(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`),
                fetchWithTimeout(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=5m&limit=1`), 
                fetchWithTimeout(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${sym}&period=5m&limit=1`),
                fetchWithTimeout(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${sym}&period=5m&limit=1`),
                fetchWithTimeout(`https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${sym}`)
            ]);
            
            if (AppState.g_pair !== reqPair) return;
            
            if (fundRes.ok) { const data = await fundRes.json(); AppState.fusionBase.funding = parseFloat(data.lastFundingRate || 0); AppState.fusionBase.markPrice = parseFloat(data.markPrice || AppState.price); }
            if (oiRes.ok) { const data = await oiRes.json(); AppState.fusionBase.oi = parseFloat(data.openInterest || 0); }
            if (globRes.ok) { const data = await globRes.json(); if (data.length > 0) { AppState.fusionBase.retail = parseFloat(data[0].longAccount); AppState.fusionBase.lsRatio = parseFloat(data[0].longShortRatio); } }
            if (topRes.ok) { const data = await topRes.json(); if (data.length > 0) AppState.fusionBase.smart = parseFloat(data[0].longAccount); }
            if (takerRes.ok) { const data = await takerRes.json(); if (data.length > 0) AppState.fusionBase.takerRatio = parseFloat(data[0].buySellRatio); }

            if (exInfoRes.ok) {
                const ex = await exInfoRes.json();
                const symInfo = Array.isArray(ex.symbols) ? ex.symbols[0] : null;
                if (symInfo) {
                    const pf = Number(symInfo.pricePrecision);
                    const pfSafe = Number.isFinite(pf) ? pf : 2;
                    const tickFilter = Array.isArray(symInfo.filters) ? symInfo.filters.find(f => f.filterType === 'PRICE_FILTER') : null;
                    const tickSize = tickFilter ? Number(tickFilter.tickSize) : 0.01;
                    AppState.marketMeta = { tickSize: Number.isFinite(tickSize) ? tickSize : 0.01, pricePrecision: pfSafe };
                }
            }
            
            AppState.fusionBase.conflict = Math.abs(AppState.fusionBase.retail - AppState.fusionBase.smart);
            let domScore = 0;
            if (AppState.fusionBase.retail < 0.5) domScore += 1; else domScore -= 1;
            if (AppState.fusionBase.smart > 0.5) domScore += 1; else domScore -= 1;
            if (AppState.fusionBase.takerRatio > 1) domScore += 1; else domScore -= 1;
            if (AppState.fusionBase.lsRatio < 1) domScore += 1; else domScore -= 1; 
            
            AppState.fusionBase.dominance = domScore > 0 ? "LONG" : (domScore < 0 ? "SHORT" : "NEUTRAL");
            AppState.fusion = { ...AppState.fusionBase };
        } catch (e) { 
            if (AppState.g_pair === reqPair) { AppState.fusion = { ...AppState.fusionBase }; markFeedHttpError('Orderflow Binance gagal dimuat; memakai state terakhir.'); } 
        }
    }
};

async function fetchMTFData() {
    const reqPair = AppState.g_pair;
    try {
        let res1 = await fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${reqPair}&interval=1h&limit=100`);
        if (AppState.g_pair !== reqPair) return;
        if (res1.ok) { 
            let c1 = (await res1.json()).map(c => ({time: c[0]/1000, close: +c[4]})); 
            if (c1.length > 0) AppState.mtf['1h'] = (c1[c1.length-1].close > calcEMA(c1, 50, 'close').pop().value) ? 'UP' : 'DOWN'; 
        }
        
        let res2 = await fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${reqPair}&interval=15m&limit=100`);
        if (res2.ok) { 
            let c2 = (await res2.json()).map(c => ({time: c[0]/1000, close: +c[4]})); 
            if (c2.length > 0) AppState.mtf['15m'] = (c2[c2.length-1].close > calcEMA(c2, 50, 'close').pop().value) ? 'UP' : 'DOWN'; 
        }
        
        let res3 = await fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${reqPair}&interval=1d&limit=50`);
        if (res3.ok) { 
            let c3 = (await res3.json()).map(c => ({time: c[0]/1000, close: +c[4]})); 
            if (c3.length > 0) AppState.mtf['1d'] = (c3[c3.length-1].close > calcEMA(c3, 20, 'close').pop().value) ? 'UP' : 'DOWN'; 
        }

        const d = document.getElementById('mtf-1d');
        const h = document.getElementById('mtf-1h');
        const m = document.getElementById('mtf-15m');
        
        if (d) { d.className = 'mtf-badge-container'; d.classList.add(AppState.mtf['1d'] === 'UP' ? 'mtf-up-box' : 'mtf-dn-box'); d.innerText = AppState.mtf['1d'] === 'UP' ? 'UPTREND' : 'DOWNTREND'; }
        if (h) { h.className = 'mtf-badge-container'; h.classList.add(AppState.mtf['1h'] === 'UP' ? 'mtf-up-box' : 'mtf-dn-box'); h.innerText = AppState.mtf['1h'] === 'UP' ? 'UPTREND' : 'DOWNTREND'; }
        if (m) { m.className = 'mtf-badge-container'; m.classList.add(AppState.mtf['15m'] === 'UP' ? 'mtf-up-box' : 'mtf-dn-box'); m.innerText = AppState.mtf['15m'] === 'UP' ? 'UPTREND' : 'DOWNTREND'; }
    } catch(e) { markFeedHttpError('MTF Binance gagal dimuat; badge memakai status terakhir.'); console.warn('fetchMTFData failed', e); }
}

async function fetchCandlesWithFallback(pair, tf) {
    const endpoints = [
        `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${tf}&limit=1000`,
        `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tf}&limit=1000`
    ];

    for (const endpoint of endpoints) {
        try {
            const res = await fetchWithTimeout(endpoint, {}, 10_000);
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) return data;
        } catch (e) {
            markFeedHttpError('Candle Binance gagal dimuat; mencoba sumber berikutnya.');
        }
    }

    markFeedHttpError('Candle Binance tidak tersedia; chart memakai fallback aman.');
    throw new Error('CANDLE_FETCH_FAILED');
}

async function fetchDataAndStart() {
    showToast("Memuat Data Market..."); 
    setChartLoading(true, "Memuat data market...");
    const reqPair = AppState.g_pair;
    const reqSessionId = AppState.configSessionId;
    try {
        const data = await fetchCandlesWithFallback(reqPair, AppState.g_tf);
        if (AppState.g_pair !== reqPair || reqSessionId !== AppState.configSessionId) return;
        let uniqueCandles = [];
        let seenTimes = new Set();
        
        for (let c of data) { 
            let time = c[0]/1000; 
            if (!seenTimes.has(time)) { 
                seenTimes.add(time); 
                uniqueCandles.push({ time: time, open: +c[1], high: +c[2], low: +c[3], close: +c[4], vol: +c[5], takerVol: +c[9] }); 
            } 
        }
        
        AppState.candles = uniqueCandles.sort((a,b) => a.time - b.time);
        if (AppState.candles.length > 0) {
            AppState.price = AppState.candles[AppState.candles.length - 1].close;
            AppState.lastPrices[AppState.g_pair] = AppState.price;
            AppState.feed.lastUpdate = Date.now();
        }

        FuturesEngine.checkOfflineHits();
        await ExchangeEngine.fetchAll(); 
        if (AppState.g_pair !== reqPair) return;
        
        scheduleChartRender(true); 
        chart.timeScale().fitContent(); 
        setChartLoading(false);
        connectWebSocket(); 
        AppState.retryCount = 0;
        resetPairFetchFailure(reqPair);
    } catch(e) {
        if (AppState.g_pair !== reqPair || reqSessionId !== AppState.configSessionId) return;
        AppState.retryCount++; 
        recordPairFetchFailure(reqPair, e && e.message ? e.message : 'Candle fetch failed');
        const delay = Math.min(3000 * AppState.retryCount, 15000); 
        showToast(`Koneksi gagal. Coba lagi ${delay/1000}s...`, true); 
        setChartLoading(true, `Koneksi gagal, retry ${delay/1000}s...`);
        AppState.retryTimer = setTimeout(() => {
            if (reqSessionId !== AppState.configSessionId) return;
            fetchDataAndStart();
        }, delay);
    }
}

function connectWebSocket() {
    if (!MarketFeed) return;
    MarketFeed.start({
        pair: AppState.g_pair,
        tf: AppState.g_tf,
        history: AppState.candles
    });
}



function syncReturnToLiveButton() {
    const btn = document.getElementById('chart-jump-right');
    if (!btn || !chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    const bars = AppState.candles.length;
    if (!range || !Number.isFinite(range.to) || bars < 5) {
        btn.classList.remove('show');
        return;
    }
    const distanceToRight = (bars - 1) - range.to;
    btn.classList.toggle('show', distanceToRight > 8);
}

window.jumpChartToRealtime = function() {
    isUserPanningChart = false;
    if (typeof smoothScrollToRealtime === 'function') smoothScrollToRealtime(true);
    syncReturnToLiveButton();
};

function updateLiveTick(liveC, meta = {}) {
    if (AppState.candles.length === 0) return;
    const lastIdx = AppState.candles.length - 1;
    const lastTime = AppState.candles[lastIdx].time;
    
    if (liveC.time < lastTime) return; 
    
    setChartLoading(false);
    AppState.price = liveC.close;
    AppState.lastPrices[AppState.g_pair] = AppState.price;
    AppState.live.price = AppState.price;

    if (meta && typeof meta === 'object') {
        if (meta.activeSource) AppState.feed.activeVenue = meta.activeSource;
        if (Number.isFinite(meta.latencyMs)) AppState.feed.latencyMs = meta.latencyMs;
        if (Number.isFinite(meta.spreadPct)) AppState.feed.spreadPct = meta.spreadPct;
        if (meta.sourceQuotes) AppState.venueQuotes = meta.sourceQuotes;
        AppState.feed.lastUpdate = Date.now();
        AppState.feed.status = meta.status || AppState.feed.status || 'LIVE';
        updateFeedStatus(meta);
    }

    FuturesEngine.updateLivePNL(AppState.price);
    
    const isNew = liveC.time > lastTime;
    if (isNew) { 
        AppState.candles.push(liveC); 
        candleLookupByTime.set(liveC.time, liveC);
        if (AppState.candles.length > 1000) {
            const removed = AppState.candles.shift();
            if (removed) candleLookupByTime.delete(removed.time);
        } 
        if (AppState.swings.highs.length > 200) AppState.swings.highs.shift();
        if (AppState.swings.lows.length > 200) AppState.swings.lows.shift();
        AppState.live.prevSignal = AppState.live.signal; 
        scheduleChartRender(); 
        if (meta && meta.status === 'SWITCHED') scheduleChartRender(true);
    } else { 
        AppState.candles[lastIdx] = liveC; 
        candleLookupByTime.set(liveC.time, liveC);
    }

    try { series.candle.update(liveC); } catch(e) {}
    
    const isUp = liveC.close >= liveC.open;
    try { series.vol.update({ time: liveC.time, value: liveC.vol, color: isUp ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)' }); } catch(e) {}

    if (liveC.vol > 0 && liveC.takerVol) {
        let lTR = liveC.takerVol / liveC.vol;
        let str = Math.min(1, liveC.vol / (AppState.volSMA[lastIdx] || 1));
        let dev = (lTR - 0.5) * str * 0.2;
        
        if (!AppState.fusion) AppState.fusion = { ...AppState.fusionBase };
        AppState.fusion.retail = Math.max(0.01, Math.min(0.99, AppState.fusionBase.retail - dev));
        AppState.fusion.smart = Math.max(0.01, Math.min(0.99, AppState.fusionBase.smart + dev));
        AppState.fusion.takerRatio = lTR;
    }
    
        
    polymarketLog.forEach(p => { 
        if (p.status === 'PENDING' && p.pair === AppState.g_pair) {
            PolyLineManager.update(p, AppState.price); 
            if (Math.floor(Date.now()/1000) >= p.targetTime) {
                let isWin = (p.direction === 'LONG' && AppState.price >= p.startPrice) || (p.direction === 'SHORT' && AppState.price <= p.startPrice);
                p.status = isWin ? 'CORRECT' : 'WRONG'; 
                PolyLineManager.update(p, AppState.price); 
                saveState(); updatePolyButtons(); updateLedgerUI();
                showToast(`Prediksi ${p.tfLabel} ${p.direction} selesai: ${p.status}`);
            }
        }
    });

    const pEl = document.getElementById('price');
    if (pEl) { 
        pEl.textContent = formatPrice(AppState.price); 
        pEl.style.color = isUp ? 'var(--color-correct)' : 'var(--color-wrong)'; 
        setTimeout(() => { pEl.style.color = 'var(--text-secondary)'; }, 300); 
    }

    const now = Date.now();
    if (liveC.isClosed || now - AppState.lastMathTime > 1200) { 
        AppState.lastMathTime = now; 
        calculateAllIndicators(); 
        
        const lIdx = AppState.indicators.e200.length - 1;
        if (lIdx >= 0) {
            if (AppState.indicators.rsi[lIdx]) series.rsi.update(AppState.indicators.rsi[lIdx]);
            if (AppState.indicators.stochK[lIdx]) series.stochK.update(AppState.indicators.stochK[lIdx]);
            if (AppState.indicators.stochD[lIdx]) series.stochD.update(AppState.indicators.stochD[lIdx]);
            if (AppState.indicators.wr[lIdx]) series.wr.update(AppState.indicators.wr[lIdx]);
        }
        const res = IntelligenceEngine.analyze(AppState.candles.length-1); 
        AppState.live = { ...AppState.live, ...res };
        applyUIVisuals(AppState.live);
        updateFeedStatus(meta);
    }
}

window.runBacktestEngine = function() {
    if (AppState.candles.length < 100) { showToast("Data History tidak cukup untuk Backtest", true); return; }
    showToast("Menjalankan OOS Backtest...", false);
    
    let wins = 0, losses = 0, grossWin = 0, grossLoss = 0, peakCap = 1000, cap = 1000, maxDD = 0;
    let oosStartIndex = AppState.candles.length - 100, oosWins = 0, oosLosses = 0;
    
    for (let i = 50; i < AppState.candles.length - 1; i++) {
        const result = IntelligenceEngine.analyze(i);
        if (result.signal === "STRONG BUY" || result.signal === "STRONG SELL") {
            let entryPrice = AppState.candles[i].close;
            let isLong = result.signal === "STRONG BUY";
            
            entryPrice = isLong ? entryPrice*(1+FEES.SLIPPAGE) : entryPrice*(1-FEES.SLIPPAGE);
            let atr = AppState.atrSMA[i] || (entryPrice*0.01);
            let tpPrice = isLong ? entryPrice + (atr*2) : entryPrice - (atr*2);
            let slPrice = isLong ? entryPrice - atr : entryPrice + atr;
            
            let hitTp = false, hitSl = false, exitPrice = entryPrice;

            for (let j = i+1; j < Math.min(i+15, AppState.candles.length); j++) {
                let futureC = AppState.candles[j];
                if (isLong) { 
                    if (futureC.low <= slPrice) { hitSl = true; exitPrice = slPrice; break; } 
                    if (futureC.high >= tpPrice) { hitTp = true; exitPrice = tpPrice; break; } 
                } else { 
                    if (futureC.high >= slPrice) { hitSl = true; exitPrice = slPrice; break; } 
                    if (futureC.low <= tpPrice) { hitTp = true; exitPrice = tpPrice; break; } 
                }
            }
            
            if (!hitTp && !hitSl && i+15 < AppState.candles.length) exitPrice = AppState.candles[i+15].close; 
            exitPrice = isLong ? exitPrice*(1-FEES.SLIPPAGE) : exitPrice*(1+FEES.SLIPPAGE);

            let rawPnl = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
            let pnlPct = rawPnl / entryPrice;
            let pnl = pnlPct - (FEES.TAKER * 2); 
            let pnlAbs = pnl * cap;
            
            if (pnl > 0) { 
                wins++; grossWin += pnlAbs; cap += pnlAbs; 
                if (i >= oosStartIndex) oosWins++; 
            } else { 
                losses++; grossLoss += Math.abs(pnlAbs); cap += pnlAbs; 
                if (i >= oosStartIndex) oosLosses++; 
            }

            if (cap > peakCap) peakCap = cap; 
            let dd = safeDiv((peakCap - cap), peakCap); 
            if (dd > maxDD) maxDD = dd;
            i += 10; 
        }
    }
    
    let total = oosWins + oosLosses;
    let oosWr = total > 0 ? (oosWins/total)*100 : 0;
    let pf = grossLoss > 0 ? safeDiv(grossWin, grossLoss) : (grossWin > 0 ? 99 : 0);
    let exp = total > 0 ? safeDiv((grossWin - grossLoss), total) : 0;
    
    setSafeText('bt-wr', oosWr.toFixed(1) + "%", oosWr > 50 ? 'var(--color-correct)' : 'var(--color-wrong)'); 
    setSafeText('bt-pf', pf.toFixed(2), pf > 1.2 ? 'var(--color-correct)' : 'var(--color-wrong)'); 
    setSafeText('bt-exp', "$" + exp.toFixed(2), exp > 0 ? 'var(--color-correct)' : 'var(--color-wrong)'); 
    setSafeText('bt-dd', "-" + (maxDD*100).toFixed(1) + "%");
}

function calcLiveWR(binType, logType) {
    const nowMs = Date.now(), ms1D = 86400000; 
    let startMs, endMs = nowMs;
    
    if (binType === 'DAILY') startMs = nowMs - ms1D; 
    else if (binType === 'WEEKLY') startMs = nowMs - (7 * ms1D); 
    else if (binType === 'MONTHLY') startMs = nowMs - (30 * ms1D);
    
    let targetLogs = logType === 'FUTURES' ? futuresLog : polymarketLog;
    let isSec = logType === 'POLY';
    
    let logs = targetLogs.filter(p => {
        if (p.pair !== AppState.g_pair) return false;
        if (p.status === 'PENDING' || p.status === 'CANCELLED') return false;
        let logTime = isSec ? p.requestTime * 1000 : (p.closeTime || p.openTime); 
        return logTime >= startMs && logTime <= endMs;
    });
    
    if (logs.length === 0) return "0%"; 
    let wins = logType === 'FUTURES' ? logs.filter(p => p.pnl > 0).length : logs.filter(p => p.status === 'CORRECT').length;
    return ((wins / logs.length) * 100).toFixed(0) + "%";
}

function createLedgerElement(tag, { className = '', text = '', attrs = {} } = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        element.setAttribute(key, String(value));
    });
    return element;
}

function appendLedgerChildren(parent, children) {
    children.filter(Boolean).forEach(child => parent.appendChild(child));
    return parent;
}

function createLedgerMetric(label, value, valueClass = 'value-strong') {
    const metric = document.createElement('div');
    appendLedgerChildren(metric, [
        createLedgerElement('div', { className: 'position-detail-label', text: label }),
        createLedgerElement('div', { className: valueClass, text: value })
    ]);
    return metric;
}

function createFuturesLedgerItem(f) {
    const isWin = f.pnl > 0;
    const isBE = f.pnl === 0;
    const sClass = f.status === 'LIQ' ? 'status-loss' : (isWin ? 'status-win' : (isBE ? 'status-be' : 'status-loss'));
    const sText = f.status === 'LIQ' ? 'LIQUIDATED' : (isWin ? 'WIN' : (isBE ? 'BE' : 'LOSS'));
    const pnlPct = ((f.pnl / f.margin) * 100).toFixed(1);
    const closeReasonDisplay = f.closeReason || f.status;
    const item = createLedgerElement('div', { className: 'memory-item' });
    const header = createLedgerElement('div', { className: 'mem-header' });
    const pair = createLedgerElement('span', { className: 'position-pair', text: `${f.pair} ` });
    pair.appendChild(createLedgerElement('span', {
        className: f.type === 'LONG' ? 'market-long' : 'market-short',
        text: `[${f.type} ${f.leverage}x]`
    }));
    const statusSuffix = f.status !== 'LIQ' && !String(f.status).includes('CLOSED') ? ` (${f.status})` : '';
    appendLedgerChildren(header, [
        pair,
        createLedgerElement('span', { className: `mem-status ${sClass}`, text: `${sText}${statusSuffix}` })
    ]);
    const meta = createLedgerElement('div', { className: 'mem-struct mem-struct-single' });
    meta.appendChild(createLedgerElement('div', {
        className: 'mem-meta',
        text: `Time: ${formatFullDate(f.closeTime)} | AI: ${f.dominantStrategy || 'Manual'} | Reason: ${closeReasonDisplay}`
    }));
    const prices = createLedgerElement('div', { className: 'mem-struct' });
    appendLedgerChildren(prices, [
        createLedgerMetric('ENTRY', formatPrice(f.entryPrice)),
        createLedgerMetric('EXIT', formatPrice(f.exitPrice))
    ]);
    const footer = createLedgerElement('div', { className: 'flex-between u-mt-4' });
    const pnlText = createLedgerElement('span', { className: 'pnl-text', text: 'PNL: ' });
    pnlText.appendChild(createLedgerElement('span', {
        className: `pnl-amount ${f.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`,
        text: `${f.pnl >= 0 ? '+' : ''}$${f.pnl.toFixed(2)} (${f.pnl >= 0 ? '+' : ''}${pnlPct}%)`
    }));
    footer.appendChild(pnlText);
    appendLedgerChildren(item, [header, meta, prices, footer]);
    return item;
}

function createPolyLedgerItem(p) {
    let sClass = 'status-run';
    let sText = 'RUNNING';
    if (p.status === 'CORRECT') { sClass = 'status-win'; sText = 'WIN'; }
    else if (p.status === 'WRONG') { sClass = 'status-loss'; sText = 'LOSS'; }
    else if (p.status === 'CANCELLED') { sClass = 'status-be'; sText = 'BATAL'; }

    const item = createLedgerElement('div', { className: 'memory-item' });
    const header = createLedgerElement('div', { className: 'mem-header' });
    const pair = createLedgerElement('span', { className: 'position-pair', text: `${p.pair} ${p.tfLabel} ` });
    pair.appendChild(createLedgerElement('span', {
        className: p.direction === 'LONG' ? 'market-long' : 'market-short',
        text: `[${p.direction}]`
    }));
    header.appendChild(pair);
    const struct = createLedgerElement('div', { className: 'mem-struct' });
    appendLedgerChildren(struct, [
        createLedgerMetric('ENTRY', formatPrice(p.startPrice)),
        createLedgerMetric('TARGET', new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(p.targetTime * 1000)), 'position-detail-value')
    ]);
    const footer = createLedgerElement('div', { className: 'flex-between u-mt-4' });
    const status = createLedgerElement('span', { className: `mem-status ${sClass}`, text: sText });
    if (p.status === 'PENDING') {
        status.appendChild(document.createTextNode(' '));
        status.appendChild(createLedgerElement('button', {
            className: 'cancel-prediction-btn',
            text: '✖',
            attrs: { type: 'button', 'data-cancel-prediction-id': p.id, 'aria-label': 'Batalkan prediksi' }
        }));
    }
    footer.appendChild(status);
    appendLedgerChildren(item, [header, struct, footer]);
    return item;
}

function updateLedgerUI() {
    setSafeText('wr-day-fut', calcLiveWR('DAILY', 'FUTURES'));
    setSafeText('wr-week-fut', calcLiveWR('WEEKLY', 'FUTURES'));
    setSafeText('wr-month-fut', calcLiveWR('MONTHLY', 'FUTURES'));
    setSafeText('wr-day-poly', calcLiveWR('DAILY', 'POLY'));
    setSafeText('wr-week-poly', calcLiveWR('WEEKLY', 'POLY'));
    setSafeText('wr-month-poly', calcLiveWR('MONTHLY', 'POLY'));

    const listObj = document.getElementById('memory-list');
    if (!listObj) return;
    listObj.replaceChildren();

    const showPoly = AppState.currentFilter === 'POLY' || AppState.currentFilter === 'WIN' || AppState.currentFilter === 'LOSS';
    const showFutures = AppState.currentFilter === 'FUTURES' || AppState.currentFilter === 'WIN' || AppState.currentFilter === 'LOSS';
    setSafeText('ledger-pair-title', AppState.g_pair);

    if (showFutures) {
        futuresLog.filter(f => f.pair === AppState.g_pair).forEach(f => {
            const isWin = f.pnl > 0;
            if (AppState.currentFilter === 'WIN' && !isWin) return;
            if (AppState.currentFilter === 'LOSS' && !(f.pnl < 0 || f.status === 'LIQ' || f.status === 'LOSS')) return;
            listObj.appendChild(createFuturesLedgerItem(f));
        });
    }

    if (showPoly) {
        polymarketLog.filter(p => p.pair === AppState.g_pair).forEach(p => {
            if (AppState.currentFilter === 'WIN' && p.status !== 'CORRECT') return;
            if (AppState.currentFilter === 'LOSS' && p.status !== 'WRONG') return;
            listObj.appendChild(createPolyLedgerItem(p));
        });
    }

    if (listObj.childElementCount === 0) {
        listObj.appendChild(createLedgerElement('div', { className: 'empty-log', text: 'Log Kosong.' }));
    }
}

window.clearMemoryLogs = function() {
    if (AppState.currentFilter === 'FUTURES') { 
        futuresLog = futuresLog.filter(f => f.pair !== AppState.g_pair); 
        safeStore('masako_flog_v44', futuresLog, APP_SCHEMA_VERSION); 
    } else if (AppState.currentFilter === 'POLY') { 
        polymarketLog = polymarketLog.filter(p => p.pair !== AppState.g_pair || p.status === 'PENDING'); 
        safeStore('masako_poly_v44', polymarketLog, APP_SCHEMA_VERSION); 
    } else { 
        futuresLog = futuresLog.filter(f => f.pair !== AppState.g_pair); 
        safeStore('masako_flog_v44', futuresLog, APP_SCHEMA_VERSION); 
        polymarketLog = polymarketLog.filter(p => p.pair !== AppState.g_pair || p.status === 'PENDING'); 
        safeStore('masako_poly_v44', polymarketLog, APP_SCHEMA_VERSION); 
    }
    updateLedgerUI(); 
    showToast("Log koin ini dibersihkan.");
};


function bindStaticUIEvents() {
    const pair = document.getElementById('pair');
    const tf = document.getElementById('tf');
    if (pair) pair.addEventListener('change', changeConfig);
    if (tf) tf.addEventListener('change', changeConfig);

    document.getElementById('btn-open-ledger')?.addEventListener('click', openModal);
    document.getElementById('chart-jump-right')?.addEventListener('click', jumpChartToRealtime);
    document.getElementById('btn-poly-5')?.addEventListener('click', () => logPolymarketAction(5));
    document.getElementById('btn-poly-15')?.addEventListener('click', () => logPolymarketAction(15));
    document.getElementById('btn-custom-balance')?.addEventListener('click', () => FuturesEngine.setCustomBalance());
    document.getElementById('tab-manual')?.addEventListener('click', () => setFuturesMode('MANUAL'));
    document.getElementById('tab-ai')?.addEventListener('click', () => setFuturesMode('AI'));
    document.getElementById('mode-cons')?.addEventListener('click', () => setAiMode('CONS'));
    document.getElementById('mode-agg')?.addEventListener('click', () => setAiMode('AGG'));
    document.getElementById('leverage-slider')?.addEventListener('input', (event) => updateLevUI(event.target.value));
    document.getElementById('tp-pct-sel')?.addEventListener('change', () => handlePctChange('tp'));
    document.getElementById('sl-pct-sel')?.addEventListener('change', () => handlePctChange('sl'));
    ['tp-price', 'sl-price'].forEach((id) => {
        document.getElementById(id)?.addEventListener('focus', (event) => {
            if (!event.target.value && AppState.price) event.target.value = formatPrice(AppState.price);
        });
    });
    document.getElementById('btn-long-sim')?.addEventListener('click', () => executeFuturesTrade('LONG', false));
    document.getElementById('btn-short-sim')?.addEventListener('click', () => executeFuturesTrade('SHORT', false));
    document.getElementById('btn-ai-execute-sim')?.addEventListener('click', () => executeFuturesTrade('AI', true));
    document.getElementById('history-modal')?.addEventListener('click', closeModal);
    document.querySelector('#history-modal .modal-content')?.addEventListener('click', (event) => event.stopPropagation());
    document.getElementById('btn-close-history')?.addEventListener('click', () => closeModal(true));
    document.getElementById('btn-run-backtest')?.addEventListener('click', runBacktestEngine);
    document.querySelectorAll('[data-ledger-filter]').forEach((button) => {
        button.addEventListener('click', () => handleSetFilter(button.dataset.ledgerFilter, button));
    });
    document.getElementById('btn-clear-logs')?.addEventListener('click', clearMemoryLogs);
    document.getElementById('action-modal')?.addEventListener('click', closeActionModal);
    document.querySelector('#action-modal .modal-content')?.addEventListener('click', (event) => event.stopPropagation());
    document.getElementById('btn-close-action')?.addEventListener('click', () => closeActionModal(true));
}

function bindDelegatedDynamicEvents() {
    document.addEventListener('input', (event) => {
        if (event.target?.id === 'partial-close-slider') {
            setSafeText('partial-close-val', `${event.target.value}%`);
        }
    });

    document.addEventListener('click', (event) => {
        const target = event.target.closest('[data-partial-close-pct], [data-action], [data-position-action], [data-cancel-prediction-id]');
        if (!target) return;

        if (target.dataset.partialClosePct) {
            const slider = document.getElementById('partial-close-slider');
            if (slider) slider.value = target.dataset.partialClosePct;
            setSafeText('partial-close-val', `${target.dataset.partialClosePct}%`);
            return;
        }

        if (target.dataset.positionAction === 'partial-close') {
            openPartialCloseModal(Number(target.dataset.positionId));
            return;
        }
        if (target.dataset.positionAction === 'edit-tpsl') {
            openEditTpSlModal(Number(target.dataset.positionId));
            return;
        }
        if (target.dataset.cancelPredictionId) {
            cancelPrediction(Number(target.dataset.cancelPredictionId));
            return;
        }

        if (target.dataset.action === 'partial-close-confirm') executePartialClose();
        if (target.dataset.action === 'auto-tpsl') autoCalculateTpSl(Number(target.dataset.positionId));
        if (target.dataset.action === 'save-tpsl') executeEditTpSl();
    });
}

bindStaticUIEvents();
bindDelegatedDynamicEvents();

if (typeof setupAuthUI === 'function') { setupAuthUI(); }
