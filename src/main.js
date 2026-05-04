function getMarketSession() { 
    const h = new Date().getUTCHours(); 
    if (h >= 13 && h < 16) return "LONDON + NEW YORK"; 
    if (h >= 8 && h < 13) return "LONDON"; 
    if (h >= 16 && h < 21) return "NEW YORK"; 
    return "ASIAN"; 
}

function triggerGlobalAlertIfNeeded() { 
    const a = document.getElementById('global-pos-alert'); 
    if (a) { 
        const o = FuturesEngine.state.positions.find(p => p.pair !== AppState.g_pair); 
        if (o) { 
            a.innerText = `⚠️ Ada Posisi Aktif di ${o.pair} (Klik untuk pindah)`; 
            a.style.display = 'block'; 
            a.onclick = () => { 
                document.getElementById('pair').value = o.pair; 
                changeConfig(); 
            }; 
            setTimeout(() => { a.style.display = 'none'; }, 5000); 
        } else { 
            a.style.display = 'none'; 
        } 
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


function updateFeedStatus(info = {}) {
    const feed = AppState.feed || {};
    const active = info.activeSource || feed.activeVenue || 'BINANCE';
    const latency = Number.isFinite(info.latencyMs) ? info.latencyMs : (Number.isFinite(feed.latencyMs) ? feed.latencyMs : 0);
    const spread = Number.isFinite(info.spreadPct) ? info.spreadPct : (Number.isFinite(feed.spreadPct) ? feed.spreadPct : 0);
    const sourceText = active ? `${active}` : '-';
    const latencyText = Number.isFinite(latency) ? `${Math.max(0, Math.round(latency))}ms` : '—';
    setSafeText('badge-source', `Feed: ${sourceText}`);
    setSafeText('badge-latency', latencyText);
    const sourceBadge = document.getElementById('badge-source');
    const latencyBadge = document.getElementById('badge-latency');
    if (sourceBadge) {
        sourceBadge.style.color = active === 'BYBIT' ? 'var(--color-correct)' : 'var(--accent-white)';
        sourceBadge.style.borderColor = active === 'BYBIT' ? 'rgba(74,222,128,0.35)' : 'var(--border-highlight)';
    }
    if (latencyBadge) {
        latencyBadge.style.color = latency > 1200 ? 'var(--color-wrong)' : (latency > 500 ? 'var(--color-warning)' : 'var(--color-correct)');
        latencyBadge.style.borderColor = latency > 1200 ? 'rgba(248,113,113,0.35)' : (latency > 500 ? 'rgba(251,191,36,0.35)' : 'rgba(74,222,128,0.35)');
    }
    feed.activeVenue = active;
    feed.primaryVenue = active;
    feed.secondaryVenue = active === 'BINANCE' ? 'BYBIT' : 'BINANCE';
    feed.latencyMs = latency;
    feed.spreadPct = spread;
    feed.lastUpdate = Date.now();
    feed.status = info.status || feed.status || 'LIVE';
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
            showToast("Polymarket: Eksekusi Paksa (AGG Mode)", false); 
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
    document.getElementById('action-modal-body').innerHTML = `
        <div style="margin-bottom: 15px;">
            <label style="font-size: 11px; color: var(--text-muted);">Persentase Penutupan (%)</label>
            <div style="display:flex; align-items:center; gap:10px; margin-top: 8px;">
                <input type="range" id="partial-close-slider" min="1" max="100" value="100" oninput="document.getElementById('partial-close-val').innerText = this.value + '%'" style="flex:1;">
                <span id="partial-close-val" style="font-weight:bold; color:var(--accent-white); width: 40px; text-align:right;">100%</span>
            </div>
        </div>
        <div class="btn-group" style="margin-bottom: 15px;">
            <button class="btn" style="background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color);" onclick="document.getElementById('partial-close-slider').value=10; document.getElementById('partial-close-val').innerText='10%'">10%</button>
            <button class="btn" style="background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color);" onclick="document.getElementById('partial-close-slider').value=25; document.getElementById('partial-close-val').innerText='25%'">25%</button>
            <button class="btn" style="background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color);" onclick="document.getElementById('partial-close-slider').value=50; document.getElementById('partial-close-val').innerText='50%'">50%</button>
            <button class="btn" style="background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color);" onclick="document.getElementById('partial-close-slider').value=100; document.getElementById('partial-close-val').innerText='100%'">All</button>
        </div>
        <button class="btn btn-danger" style="width:100%;" onclick="executePartialClose()">Konfirmasi Tutup</button>
    `;
    document.getElementById('action-modal').classList.add('active');
}

window.executePartialClose = function() { 
    let pct = parseFloat(document.getElementById('partial-close-slider').value); 
    if (isNaN(pct) || pct <= 0 || pct > 100) { 
        showToast("Persentase maksimal 100%", true); 
        return; 
    } 
    FuturesEngine.closePosition(AppState.actionPosId, false, "CLOSED", pct); 
    closeActionModal(true); 
}

window.openEditTpSlModal = function(id) {
    AppState.actionPosId = id; 
    let pos = FuturesEngine.state.positions.find(p => p.id === id); 
    if (!pos) return;
    
    document.getElementById('action-modal-title').innerText = "Edit TP / SL Posisi Aktif";
    document.getElementById('action-modal-body').innerHTML = `
        <button class="btn" style="background:var(--bg-input); color:var(--color-warning); border:1px solid var(--color-warning); width:100%; margin-bottom: 15px;" onclick="autoCalculateTpSl(${id})">✨ Hitung Otomatis TP/SL (ATR Base)</button>
        <div style="margin-bottom: 10px;">
            <label style="font-size: 11px; color: var(--text-muted);">Target Price (TP)</label>
            <input type="number" id="edit-tp-val" value="${pos.tp || ''}" placeholder="Kosongkan untuk menghapus">
        </div>
        <div style="margin-bottom: 15px;">
            <label style="font-size: 11px; color: var(--text-muted);">Stop Loss Price (SL)</label>
            <input type="number" id="edit-sl-val" value="${pos.sl || ''}" placeholder="Kosongkan untuk menghapus">
        </div>
        <label class="checkbox-container" style="margin-bottom: 10px;">
            <input type="checkbox" id="edit-hedge-ts" ${pos.autoHedgeTrail ? 'checked' : ''}>
            <span>Automatic Hedging Trailing Stop</span>
        </label>
        <div style="margin-bottom: 15px;">
            <label style="font-size: 11px; color: var(--text-muted);">Hedge Callback %</label>
            <input type="number" id="edit-hedge-callback" value="${pos.tsCallback || ''}" placeholder="Contoh: 1">
        </div>
        <button class="btn btn-primary" style="width:100%;" onclick="executeEditTpSl()">Simpan Pembaruan</button>
    `;
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
        pos.tp = tp !== null && (isNaN(tp) || tp <= 0) ? null : tp; 
        pos.sl = sl !== null && (isNaN(sl) || sl <= 0) ? null : sl; 
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
        
        if (pos.autoHedgeTrail) {
            FuturesEngine.syncHedgeTrailingState(pos, AppState.price || pos.entryPrice);
        }
        showToast("TP/SL & Hedging Berhasil Diperbarui!"); 
    }
    closeActionModal(true);
}

const IntelligenceEngine = {
    buildMarketState(idx, data, ind) {
        const c = data[idx]; 
        let atr = AppState.atrSMA[idx] ? AppState.atrSMA[idx] : (c.high - c.low);
        let atrRank = atr > 0 ? safeDiv((c.high - c.low), atr) : 1;
        
        let volRegime = atrRank > 1.2 ? "EXPANSION" : (atrRank < 0.6 ? "CHOP" : "NORMAL");
        let volAvg = AppState.volSMA[idx] || c.vol;
        let liqRegime = c.vol > volAvg * 1.5 ? "HEAVY" : (c.vol < volAvg * 0.5 ? "THIN" : "NORMAL");
        
        let e200 = ind.e200[idx] ? ind.e200[idx].value : c.close;
        let trendRegime = "SIDEWAYS";
        
        if (c.close > e200 && ind.st[idx] && ind.st[idx].trend === 1) trendRegime = "STRONG_UP"; 
        else if (c.close < e200 && ind.st[idx] && ind.st[idx].trend === -1) trendRegime = "STRONG_DOWN";
        
        return { regime: trendRegime, volatility: volRegime, liquidity: liqRegime, atr: atr };
    },

    analyzeSubModels(idx, data, ind, f, state) {
        let scores = { trend: 0, meanRev: 0, breakout: 0, liquidity: 0, whale: 0 };
        let reasons = []; 
        const c = data[idx]; 
        let e200 = ind.e200[idx] ? ind.e200[idx].value : c.close;
        
        const checkStatus = (key, raw) => AI_STATS[key].status === 'DISABLED' ? 0 : raw * (AI_STATS[key].status === 'BOOSTED' ? 1.5 : 1);

        let rawLiq = 0;
        if (idx > 3) { 
            let c2 = data[idx-2]; 
            if (c2.high < c.low) { rawLiq += 20; reasons.push("Bull FVG"); } 
            if (c2.low > c.high) { rawLiq -= 20; reasons.push("Bear FVG"); } 
        }
        
        let lookback = Math.max(0, idx-10);
        let minL = Math.min(...data.slice(lookback, idx).map(x=>x.low));
        let maxH = Math.max(...data.slice(lookback, idx).map(x=>x.high));
        
        if (c.low < minL && c.close > minL && c.close > c.open) { rawLiq += 30; reasons.push("Stop Hunt Low"); }
        if (c.high > maxH && c.close < maxH && c.close < c.open) { rawLiq -= 30; reasons.push("Stop Hunt High"); }
        if (ind.poc[idx] && Math.abs(c.close - ind.poc[idx].value)/c.close < 0.005) { rawLiq += 10; reasons.push("POC Interaction"); }
        scores.liquidity = checkStatus('liquidity', rawLiq);

        let rawWhale = 0;
        let isPriceUp = c.close > c.open;
        
        if (isPriceUp && f.smart < 0.45) { rawWhale -= 30; reasons.push("Smart Sell Div"); } 
        if (!isPriceUp && f.smart > 0.55) { rawWhale += 30; reasons.push("Smart Buy Div"); }
        if (f.funding > 0.005 && state.regime !== 'STRONG_UP') { rawWhale -= 20; reasons.push("Fund Trap Squeeze"); } 
        if (f.funding < -0.005 && state.regime !== 'STRONG_DOWN') { rawWhale += 20; reasons.push("Fund Trap Bounce"); }
        
        if(idx > 5 && ind.cvd[idx] && ind.cvd[idx-5]) {
            if(ind.cvd[idx].value > ind.cvd[idx-5].value && c.close <= data[idx-5].close) { rawWhale += 20; reasons.push("CVD Bull Div"); }
            if(ind.cvd[idx].value < ind.cvd[idx-5].value && c.close >= data[idx-5].close) { rawWhale -= 20; reasons.push("CVD Bear Div"); }
        }
        if(idx > 5 && ind.obv[idx] && ind.obv[idx-5]) { 
            if(ind.obv[idx].value > ind.obv[idx-5].value) rawWhale += 10; 
            else rawWhale -= 10; 
        }
        scores.whale = checkStatus('whale', rawWhale);

        let rawMean = 0;
        let vwap = ind.vwap[idx] ? ind.vwap[idx].value : c.close;
        let vwapDist = safeDiv((c.close - vwap), vwap);
        
        if (vwapDist > 0.015) { rawMean -= 25; reasons.push("VWAP OB"); } 
        else if (vwapDist < -0.015) { rawMean += 25; reasons.push("VWAP OS"); }
        
        let rsi = ind.rsi[idx] ? ind.rsi[idx].value : 50;
        if (rsi > 70) { rawMean -= 30; reasons.push("RSI OB"); } 
        else if (rsi < 30) { rawMean += 30; reasons.push("RSI OS"); }
        
        if(ind.bb[idx]) { 
            if(c.close > ind.bb[idx].upper) { rawMean -= 20; reasons.push("BB Upper Hit"); } 
            if(c.close < ind.bb[idx].lower) { rawMean += 20; reasons.push("BB Lower Hit"); } 
        }
        if(ind.mfi[idx]) { 
            if(ind.mfi[idx].value > 80) { rawMean -= 15; reasons.push("MFI Overbought"); } 
            if(ind.mfi[idx].value < 20) { rawMean += 15; reasons.push("MFI Oversold"); } 
        }
        if (state.regime.includes("STRONG")) rawMean = 0; 
        scores.meanRev = checkStatus('meanRev', rawMean);

        let rawTrend = 0;
        if (ind.st[idx] && ind.st[idx-1]) {
            if (ind.st[idx].trend === 1) rawTrend += 20; else rawTrend -= 20;
            if (ind.st[idx-1].trend !== ind.st[idx].trend) { rawTrend *= 1.5; reasons.push("ST Flip"); }
        }
        if (c.close > e200) rawTrend += 10; else rawTrend -= 10;
        
        let adx = ind.adx[idx] ? ind.adx[idx].value : 0; 
        let macd = ind.macd[idx];
        let prevMacd = ind.macd[idx-1];
        if (macd && prevMacd) { 
            if (macd.value > 0 && prevMacd.value <= 0) { rawTrend += 15; reasons.push("MACD Bull Cross"); } 
            if (macd.value < 0 && prevMacd.value >= 0) { rawTrend -= 15; reasons.push("MACD Bear Cross"); } 
        }
        
        if(ind.psar[idx] && c.close > ind.psar[idx].value) rawTrend += 10; else rawTrend -= 10;
        if(ind.linreg[idx] && ind.linreg[idx].slope > 0) rawTrend += 10; else rawTrend -= 10;
        if(ind.ichimoku[idx] && c.close > ind.ichimoku[idx].kijun) rawTrend += 10; else rawTrend -= 10;
        
        if (state.volatility === "CHOP") rawTrend *= 0.5; 
        scores.trend = checkStatus('trend', rawTrend);

        let rawBrk = 0;
        let rH = AppState.swings.highs.filter(s => s.time < c.time).slice(-1)[0];
        let rL = AppState.swings.lows.filter(s => s.time < c.time).slice(-1)[0];
        
        if (rH && c.close > rH.val && isPriceUp && state.liquidity === "HEAVY") { 
            rawBrk += 25; if (adx > 25) rawBrk *= 1.5; reasons.push("Vol Breakout Bull"); 
        }
        if (rL && c.close < rL.val && !isPriceUp && state.liquidity === "HEAVY") { 
            rawBrk -= 25; if (adx > 25) rawBrk *= 1.5; reasons.push("Vol Breakout Bear"); 
        }
        if(ind.volosc[idx] && ind.volosc[idx].value > 20) rawBrk += 10;
        if(ind.pivots[idx] && c.close > ind.pivots[idx].r1) { rawBrk += 15; reasons.push("R1 Breakout"); }
        if(ind.pivots[idx] && c.close < ind.pivots[idx].s1) { rawBrk -= 15; reasons.push("S1 Breakdown"); }
        scores.breakout = checkStatus('breakout', rawBrk);

        return { scores, reasons, adx };
    },

    analyze(idx) {
        const f = AppState.fusion || AppState.fusionBase;
        const data = AppState.candles;
        const ind = AppState.indicators;
        const c = data[idx];
        const session = getMarketSession();
        
        if (idx < 200 || !ind.e200[idx]) {
            return { score: 0, signal: "WAIT", type: "WAIT", risk: "MED", prob: 0, insightArr: ["Init Warmup..."], regime: "ANALYSING", volRegime: "NORMAL", session: session, fData: f, dominantStrategy: "NONE", atr: 0, age: 0 };
        }

        let state = this.buildMarketState(idx, data, ind); 
        AppState.marketState = state; 
        
        let models = this.analyzeSubModels(idx, data, ind, f, state);
        
        let rawScore = (models.scores.trend * AI_STATS.trend.w) + 
                       (models.scores.meanRev * AI_STATS.meanRev.w) + 
                       (models.scores.breakout * AI_STATS.breakout.w) + 
                       (models.scores.liquidity * AI_STATS.liquidity.w) + 
                       (models.scores.whale * AI_STATS.whale.w);
                       
        let dominantStrategy = Object.keys(models.scores).reduce((a, b) => Math.abs(models.scores[a]) > Math.abs(models.scores[b]) ? a : b);
        let reason = [...new Set(models.reasons)].slice(0, 3); 

        let mtf1h = AppState.mtf['1h'];
        let context = (mtf1h === 'UP' && c.close > ind.e200[idx].value) ? "BULLISH" : ((mtf1h === 'DOWN' && c.close < ind.e200[idx].value) ? "BEARISH" : "MIXED");
        
        if (context === "BULLISH" && rawScore < 0) rawScore *= 0.5; 
        if (context === "BEARISH" && rawScore > 0) rawScore *= 0.5;
        
        rawScore = Math.max(-100, Math.min(100, rawScore)); 
        AppState.smoothedScore = (AppState.smoothedScore * 0.8) + (rawScore * 0.2); 
        let score = AppState.smoothedScore;
        let prob = Math.abs(score) >= 10 ? 100 / (1 + Math.exp(-Math.abs(score)/20)) : 0; 
        AppState.smoothedProb = (AppState.smoothedProb * 0.9) + (prob * 0.1); 

        let risk = safeDiv(c.high - c.low, c.close) < 0.002 ? "LOW" : "HIGH";
        let sig = "WAIT";
        let type = "WAIT";
        
        let threshExecute = AppState.aiMode === 'CONS' ? 45 : 30;
        let volAvg = AppState.volSMA[idx] || 1;
        let isVolumeStrong = c.vol > (volAvg * 1.1);
        let trendAligned = false;
        
        if (rawScore > 0 && AppState.mtf['1h'] === 'UP') trendAligned = true;
        if (rawScore < 0 && AppState.mtf['1h'] === 'DOWN') trendAligned = true;

        if (models.adx < 25) {
            sig = "WAIT"; type = "WAIT"; reason.push("Entropy Guard (ADX < 25)");
        } else if (Math.abs(score) >= threshExecute && trendAligned && isVolumeStrong) {
            if (score > 0) { sig = "STRONG BUY"; type = "EXECUTE"; } 
            else { sig = "STRONG SELL"; type = "EXECUTE"; }
        } else if (Math.abs(score) >= (threshExecute * 0.7)) {
            sig = "WAITING CONFLUENCE"; type = "WAIT";
        } else {
            sig = "WAIT"; type = "WAIT";
        }

        if (!trendAligned && Math.abs(score) >= threshExecute) reason.push("Blocked by MTF Trend");
        if (!isVolumeStrong && Math.abs(score) >= threshExecute) reason.push("Low Volume Warning");
        if (reason.length === 0) reason.push("Flow Neutral");
        
        let age = ((sig === "STRONG BUY" || sig === "STRONG SELL") && AppState.live.prevSignal === sig) ? AppState.live.age + 1 : 0;
        if (age > 2) reason.push(`Signal Age: ${age}`);

        let shouldSignal = false;
        if (sig === "STRONG BUY" || sig === "STRONG SELL") shouldSignal = true;

        if (shouldSignal && age === 0) {
            AppState.aiSignalMarkers = [{ 
                pair: AppState.g_pair, time: c.time, 
                position: sig === 'STRONG BUY' ? 'belowBar' : 'aboveBar', 
                color: sig === 'STRONG BUY' ? '#fbbf24' : '#ef4444', 
                shape: sig === 'STRONG BUY' ? 'arrowUp' : 'arrowDown', 
                text: sig === 'STRONG BUY' ? 'LONG' : 'SHORT' 
            }];
        }

        let activePos = FuturesEngine.state.positions.find(p => p.pair === AppState.g_pair);
        if (activePos) {
            let pnlR = activePos.type === 'LONG' ? (c.close - activePos.entryPrice) : (activePos.entryPrice - c.close);
            let shouldClose = false;
            if (activePos.type === 'LONG' && score <= -threshExecute) shouldClose = true;
            if (activePos.type === 'SHORT' && score >= threshExecute) shouldClose = true;
            
            if (shouldClose) {
                let cCol = pnlR >= 0 ? '#4ade80' : '#ef4444'; 
                let existingCl = AppState.aiSignalMarkers.filter(m => m.pair === AppState.g_pair && m.text === 'CLOSE').slice(-1)[0];
                if (!existingCl || (c.time - existingCl.time > 1800)) {
                    AppState.aiSignalMarkers.push({ pair: AppState.g_pair, time: c.time, position: 'inBar', color: cCol, shape: 'circle', text: 'CLOSE' });
                }
            }
        }

        return { score, signal: sig, type, risk, insightArr: reason, prob: AppState.smoothedProb, regime: state.regime, volRegime: state.volatility, session, fData: f, dominantStrategy, atr: state.atr, age };
    }
};

function initApp() {
    const savedPair = localStorage.getItem('masako_pref_pair');
    const savedTf = localStorage.getItem('masako_pref_tf');
    
    if (savedPair) document.getElementById('pair').value = savedPair; 
    if (savedTf) document.getElementById('tf').value = savedTf;
    if (isNaN(FuturesEngine.state.balance) || FuturesEngine.state.balance <= 0) { 
        FuturesEngine.state.balance = 10000; FuturesEngine.save(); 
    }
    updateEquityDisplay(); 
    document.getElementById('leverage-slider').value = 25; 
    updateLevUI(25); 
    setAiMode('CONS'); 
    changeConfig(); 
}

window.setAiMode = function(mode) {
    AppState.aiMode = mode;
    document.getElementById('mode-cons').classList.toggle('active-cons', mode === 'CONS'); 
    document.getElementById('mode-agg').classList.toggle('active-agg', mode === 'AGG');
    document.getElementById('ai-mode-desc').innerText = mode === 'CONS' ? "Delay Filter ON. Sabar." : "Delay Filter OFF. Agresif.";
};

window.changeConfig = function() {
    AppState.g_pair = document.getElementById('pair').value; 
    AppState.g_tf = document.getElementById('tf').value; 
    AppState.g_base = AppState.g_pair.replace("USDT", "");
    
    safeStore('masako_pref_pair', AppState.g_pair, APP_SCHEMA_VERSION); 
    safeStore('masako_pref_tf', AppState.g_tf, APP_SCHEMA_VERSION);
    
    AppState.isIntentionalClose = true;
    if (MarketFeed) MarketFeed.stop();
    
    if (AppState.wsKline) { AppState.wsKline.close(); AppState.wsKline = null; }
    if (AppState.reconnectTimer) clearTimeout(AppState.reconnectTimer);
    if (window.mtfTimer) clearInterval(window.mtfTimer);
    
    FuturesEngine.clearChartLines(); 
    FuturesEngine.posLines = {}; 
    
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

const ExchangeEngine = {
    async fetchAll() {
        const reqPair = AppState.g_pair;
        try {
            const sym = reqPair;
            const [fundRes, oiRes, globRes, topRes, takerRes, exInfoRes] = await Promise.all([
                fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`), 
                fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`),
                fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=5m&limit=1`), 
                fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${sym}&period=5m&limit=1`),
                fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${sym}&period=5m&limit=1`),
                fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${sym}`)
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
            if (AppState.g_pair === reqPair) AppState.fusion = { ...AppState.fusionBase }; 
        }
    }
};

async function fetchMTFData() {
    const reqPair = AppState.g_pair;
    try {
        let res1 = await fetch(`https://api.binance.com/api/v3/klines?symbol=${reqPair}&interval=1h&limit=100`);
        if (AppState.g_pair !== reqPair) return;
        if (res1.ok) { 
            let c1 = (await res1.json()).map(c => ({time: c[0]/1000, close: +c[4]})); 
            if (c1.length > 0) AppState.mtf['1h'] = (c1[c1.length-1].close > calcEMA(c1, 50, 'close').pop().value) ? 'UP' : 'DOWN'; 
        }
        
        let res2 = await fetch(`https://api.binance.com/api/v3/klines?symbol=${reqPair}&interval=15m&limit=100`);
        if (res2.ok) { 
            let c2 = (await res2.json()).map(c => ({time: c[0]/1000, close: +c[4]})); 
            if (c2.length > 0) AppState.mtf['15m'] = (c2[c2.length-1].close > calcEMA(c2, 50, 'close').pop().value) ? 'UP' : 'DOWN'; 
        }
        
        let res3 = await fetch(`https://api.binance.com/api/v3/klines?symbol=${reqPair}&interval=1d&limit=50`);
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
    } catch(e) {}
}

async function fetchDataAndStart() {
    showToast("Memuat Data Market..."); 
    const reqPair = AppState.g_pair;
    try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${reqPair}&interval=${AppState.g_tf}&limit=1000`);
        if (!res.ok) throw new Error("API Failed");
        if (AppState.g_pair !== reqPair) return; 
        
        const data = await res.json();
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
        connectWebSocket(); 
        AppState.retryCount = 0;
    } catch(e) {
        if (AppState.g_pair !== reqPair) return;
        AppState.retryCount++; 
        const delay = Math.min(3000 * AppState.retryCount, 15000); 
        showToast(`Koneksi gagal. Coba lagi ${delay/1000}s...`, true); 
        setTimeout(fetchDataAndStart, delay);
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


function updateLiveTick(liveC, meta = {}) {
    if (AppState.candles.length === 0) return;
    const lastIdx = AppState.candles.length - 1;
    const lastTime = AppState.candles[lastIdx].time;
    
    if (liveC.time < lastTime) return; 
    
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
        if (AppState.candles.length > 1000) AppState.candles.shift(); 
        if (AppState.swings.highs.length > 200) AppState.swings.highs.shift();
        if (AppState.swings.lows.length > 200) AppState.swings.lows.shift();
        AppState.live.prevSignal = AppState.live.signal; 
        scheduleChartRender(); 
        if (meta && meta.status === 'SWITCHED') scheduleChartRender(true);
    } else { 
        AppState.candles[lastIdx] = liveC; 
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
    
    if (AppState.ui?.autoFollowLive && !isUserPanningChart && typeof smoothScrollToRealtime === 'function') {
        smoothScrollToRealtime();
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
        let logTime = isSec ? p.requestTime * 1000 : p.openTime; 
        return logTime >= startMs && logTime <= endMs;
    });
    
    if (logs.length === 0) return "0%"; 
    let wins = logType === 'FUTURES' ? logs.filter(p => p.pnl > 0).length : logs.filter(p => p.status === 'CORRECT').length;
    return ((wins / logs.length) * 100).toFixed(0) + "%";
}

function updateLedgerUI() {
    setSafeText('poly-wr-d', calcLiveWR('DAILY', 'POLY')); 
    setSafeText('poly-wr-w', calcLiveWR('WEEKLY', 'POLY')); 
    setSafeText('poly-wr-m', calcLiveWR('MONTHLY', 'POLY'));
    
    setSafeText('fut-wr-d', calcLiveWR('DAILY', 'FUTURES')); 
    setSafeText('fut-wr-w', calcLiveWR('WEEKLY', 'FUTURES')); 
    setSafeText('fut-wr-m', calcLiveWR('MONTHLY', 'FUTURES'));

    const wDisplay = document.getElementById('ai-weights-display');
    if (wDisplay) {
        wDisplay.innerHTML = Object.keys(AI_STATS).map(k => {
            let sClass = AI_STATS[k].status === 'DISABLED' ? 'color:var(--color-wrong);' : (AI_STATS[k].status === 'BOOSTED' ? 'color:var(--color-correct);' : 'color:var(--accent-white);');
            return `<span style="font-size:9px; padding:2px 4px; background:var(--bg-input); border-radius:4px; border:1px solid var(--border-highlight); color:var(--text-secondary);">${k.toUpperCase()}: <span style="${sClass}">${AI_STATS[k].w.toFixed(2)}x</span></span>`;
        }).join('');
    }

    const listObj = document.getElementById('memory-list'); 
    if (!listObj) return; 
    listObj.innerHTML = '';
    
    let showPoly = AppState.currentFilter === 'POLY' || AppState.currentFilter === 'WIN' || AppState.currentFilter === 'LOSS';
    let showFutures = AppState.currentFilter === 'FUTURES' || AppState.currentFilter === 'WIN' || AppState.currentFilter === 'LOSS';
    document.getElementById('ledger-pair-title').innerText = AppState.g_pair;

    if (showFutures) {
        let pairFutures = futuresLog.filter(f => f.pair === AppState.g_pair);
        pairFutures.forEach(f => {
            let isWin = f.pnl > 0, isBE = f.pnl === 0;
            if (AppState.currentFilter === 'WIN' && !isWin) return; 
            if (AppState.currentFilter === 'LOSS' && isWin && !isBE) return;
            
            let sClass = f.status === 'LIQ' ? 'status-loss' : (isWin ? 'status-win' : (isBE ? 'status-be' : 'status-loss'));
            let sText = f.status === 'LIQ' ? 'LIQUIDATED' : (isWin ? 'WIN' : (isBE ? 'BE' : 'LOSS'));
            let pnlPct = ((f.pnl / f.margin) * 100).toFixed(1);
            let closeReasonDisplay = f.closeReason || f.status;
            
            const div = document.createElement('div'); 
            div.className = 'memory-item';
            div.innerHTML = `
                <div class="mem-header">
                    <span style="color:var(--text-primary); font-weight:800;">${f.pair} <span style="color:${f.type === 'LONG' ? 'var(--color-correct)' : 'var(--color-wrong)'};">[${f.type} ${f.leverage}x]</span></span>
                    <span class="mem-status ${sClass}">${sText} ${f.status !== 'LIQ' && !f.status.includes('CLOSED') ? `(${f.status})` : ''}</span>
                </div>
                <div class="mem-struct" style="grid-template-columns: 1fr;">
                    <div style="font-size:10px; color:var(--text-secondary);">Time: ${formatFullDate(f.closeTime)} | AI: ${f.dominantStrategy||'Manual'} | Reason: ${closeReasonDisplay}</div>
                </div>
                <div class="mem-struct">
                    <div><div style="color:var(--text-muted); margin-bottom:2px;">ENTRY</div><div style="font-weight:700;">${formatPrice(f.entryPrice)}</div></div>
                    <div><div style="color:var(--text-muted); margin-bottom:2px;">EXIT</div><div style="font-weight:700;">${formatPrice(f.exitPrice)}</div></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:4px;">
                    <span style="font-size:11px; color:var(--text-secondary);">PNL: <span style="margin-left:4px; font-weight:800; color:${f.pnl >= 0 ? 'var(--color-correct)' : 'var(--color-wrong)'}">${f.pnl >= 0 ? '+' : ''}$${f.pnl.toFixed(2)} (${f.pnl >= 0 ? '+' : ''}${pnlPct}%)</span></span>
                </div>
            `;
            listObj.appendChild(div);
        });
    }

    if (showPoly) {
        let pairPoly = polymarketLog.filter(p => p.pair === AppState.g_pair);
        pairPoly.forEach(p => {
            if (AppState.currentFilter === 'WIN' && p.status !== 'CORRECT') return; 
            if (AppState.currentFilter === 'LOSS' && p.status !== 'WRONG') return;
            
            let sClass = 'status-run', sText = 'RUNNING', cancelBtn = '';
            
            if (p.status === 'CORRECT') { sClass = 'status-win'; sText = 'WIN'; } 
            else if (p.status === 'WRONG') { sClass = 'status-loss'; sText = 'LOSS'; } 
            else if (p.status === 'CANCELLED') { sClass = 'status-be'; sText = 'BATAL'; } 
            else if (p.status === 'PENDING') { cancelBtn = `<button style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; margin-left:4px;" onclick="cancelPrediction(${p.id})">✖</button>`; }

            const div = document.createElement('div'); 
            div.className = 'memory-item';
            div.innerHTML = `
                <div class="mem-header">
                    <span style="color:var(--text-primary); font-weight:800;">${escapeHTML(p.pair)} ${escapeHTML(p.tfLabel)} <span style="color:${p.direction === 'LONG' ? 'var(--color-correct)' : 'var(--color-wrong)'};">[${escapeHTML(p.direction)}]</span></span>
                </div>
                <div class="mem-struct">
                    <div><div style="color:var(--text-muted); margin-bottom:2px;">ENTRY</div><div style="font-weight:700;">${formatPrice(p.startPrice)}</div></div>
                    <div><div style="color:var(--text-muted); margin-bottom:2px;">TARGET</div><div style="font-weight:700; color:var(--text-secondary);">${new Intl.DateTimeFormat('id-ID', {hour:'2-digit',minute:'2-digit'}).format(new Date(p.targetTime*1000))}</div></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:4px;">
                    <span class="mem-status ${sClass}">${sText} ${cancelBtn}</span>
                </div>
            `;
            listObj.appendChild(div);
        });
    }

    if (listObj.innerHTML === '') {
        listObj.innerHTML = '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding: 20px 0;">Log Kosong.</div>'; 
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

initApp();
