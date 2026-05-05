const PolyLineManager = {
    lines: {},
    draw(p) { 
        if (!series || !series.candle) return; 
        if (!this.lines[p.id]) { 
            this.lines[p.id] = series.candle.createPriceLine({ 
                price: p.startPrice, 
                color: p.direction === 'LONG' ? '#4ade80' : '#f87171', 
                lineWidth: 2, 
                lineStyle: 0, 
                axisLabelVisible: true, 
                title: `Poly ${p.direction.charAt(0)}` 
            }); 
        } 
    },
    update(p, currentPrice) { 
        let line = this.lines[p.id]; 
        if (!line) return; 
        let isWin = (p.direction === 'LONG' && currentPrice >= p.startPrice) || (p.direction === 'SHORT' && currentPrice <= p.startPrice); 
        line.applyOptions({ 
            title: `Poly ${p.direction.charAt(0)} | ${isWin ? 'WIN' : 'LOSS'}`, 
            color: isWin ? '#4ade80' : '#ef4444' 
        }); 
    },
    remove(id) { 
        if (this.lines[id] && series.candle) { 
            try { series.candle.removePriceLine(this.lines[id]); } catch(e) { console.warn('Chart cleanup warning', e); } 
            delete this.lines[id]; 
        } 
    },
    clear() { 
        for (let id in this.lines) { this.remove(id); } 
        this.lines = {}; 
    }
};

let chart, rsiChart, resizeObserver = null, series = {};
let candleLookupByTime = new Map();
let rsiLookupByTime = new Map();
let chartRenderQueued = false;
let isUserPanningChart = false;
let resumeAutoFollowTimer = null;
let returnButtonSyncQueued = false;

const queueReturnToLiveButtonSync = () => {
    if (returnButtonSyncQueued) return;
    returnButtonSyncQueued = true;
    requestAnimationFrame(() => {
        returnButtonSyncQueued = false;
        if (typeof syncReturnToLiveButton === 'function') syncReturnToLiveButton();
    });
};

const markManualPan = () => {
    isUserPanningChart = true;
    if (resumeAutoFollowTimer) clearTimeout(resumeAutoFollowTimer);
    resumeAutoFollowTimer = setTimeout(() => {
        isUserPanningChart = false;
    }, 1500);
};

let realtimeFollowQueued = false;
function smoothScrollToRealtime() {
    if (realtimeFollowQueued || isUserPanningChart || !chart || !rsiChart) return;
    realtimeFollowQueued = true;
    requestAnimationFrame(() => {
        realtimeFollowQueued = false;
        try { chart.timeScale().scrollToRealTime(); } catch (e) {}
        try { rsiChart.timeScale().scrollToRealTime(); } catch (e) {}
    });
}

function scheduleChartRender(force = false) {
    if (chartRenderQueued && !force) return;
    chartRenderQueued = true;
    requestAnimationFrame(() => {
        chartRenderQueued = false;
        if (typeof renderFullChart === 'function') renderFullChart();
    });
}

window.scheduleChartRender = scheduleChartRender;

function setupChart() {
    const mainChartDom = document.getElementById('main-chart');
    const rsiChartDom = document.getElementById('rsi-chart');
    const containerDom = document.getElementById('chart-container');
    
    let h = containerDom.clientHeight;
    let w = containerDom.clientWidth; 
    
    if (w === 0) w = window.innerWidth || 800; 
    if (h === 0) h = window.innerHeight ? window.innerHeight * 0.6 : 400;

    chart = LightweightCharts.createChart(mainChartDom, {
        width: w, 
        height: Math.max(h - 140, 100), 
        layout: { background: { type: 'solid', color: '#000000' }, textColor: '#a1a1aa', fontSize: 11 },
        grid: { vertLines: { color: 'rgba(39, 39, 42, 0.2)' }, horzLines: { color: 'rgba(39, 39, 42, 0.2)' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal }, 
        rightPriceScale: { borderColor: '#27272a', autoScale: true, scaleMargins: { top: 0.1, bottom: 0.2 } }, 
        timeScale: { borderColor: '#27272a', timeVisible: true, rightOffset: 8, minBarSpacing: 2 },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false, kineticScroll: { touch: true, mouse: true } },
        handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: false, pinch: true }
    });
    
    series.vol = chart.addHistogramSeries({ color: 'rgba(38, 166, 154, 0.5)', priceFormat: { type: 'volume' }, priceScaleId: 'volume_scale' });
    chart.priceScale('volume_scale').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    series.candle = chart.addCandlestickSeries({ 
        upColor: '#000000', downColor: '#ffffff', borderUpColor: '#ffffff', borderDownColor: '#ffffff', wickUpColor: '#ffffff', wickDownColor: '#ffffff',
        priceFormat: { type: 'custom', minMove: 0.00000001, formatter: (price) => formatPrice(price) } 
    });
    
    rsiChart = LightweightCharts.createChart(rsiChartDom, {
        width: w, height: 140, 
        layout: { background: { type: 'solid', color: '#000000' }, textColor: '#71717a', fontSize:10 },
        grid: { vertLines: { color: 'rgba(39, 39, 42, 0.5)' }, horzLines: { color: 'rgba(39, 39, 42, 0.5)' } }, 
        rightPriceScale: { borderColor: '#27272a', autoScale: true, entireTextOnly: false }, 
        timeScale: { visible: false, rightOffset: 8, minBarSpacing: 2 },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false, kineticScroll: { touch: true, mouse: true } },
        handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: false, pinch: true }
    });
    
    series.rsi = rsiChart.addLineSeries({ color: '#00e5ff', lineWidth: 2, crosshairMarkerVisible: false, priceLineVisible: false });
    series.stochK = rsiChart.addLineSeries({ color: '#ffff00', lineWidth: 1, crosshairMarkerVisible: false, priceLineVisible: false });
    series.stochD = rsiChart.addLineSeries({ color: '#d500f9', lineWidth: 1, crosshairMarkerVisible: false, priceLineVisible: false });
    series.wr = rsiChart.addLineSeries({ color: '#ff1744', lineWidth: 1, crosshairMarkerVisible: false, priceLineVisible: false });
    
    series.rsi.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.5)', lineWidth: 1, lineStyle: 2 });
    series.rsi.createPriceLine({ price: 30, color: 'rgba(34, 197, 94, 0.5)', lineWidth: 1, lineStyle: 2 });
    series.wr.createPriceLine({ price: -20, color: 'rgba(239, 68, 68, 0.2)', lineWidth: 1, lineStyle: 2 });
    series.wr.createPriceLine({ price: -80, color: 'rgba(34, 197, 94, 0.2)', lineWidth: 1, lineStyle: 2 });
    
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => { 
        markManualPan();
        queueReturnToLiveButtonSync();
        if (AppState.syncingScales) return;
        AppState.syncingScales = true;
        rsiChart.timeScale().setVisibleLogicalRange(range);
        AppState.syncingScales = false;
    });
    
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => { 
        markManualPan();
        queueReturnToLiveButtonSync();
        if (AppState.syncingScales) return;
        AppState.syncingScales = true;
        chart.timeScale().setVisibleLogicalRange(range);
        AppState.syncingScales = false;
    });
    
    chart.timeScale().subscribeVisibleLogicalRangeChange(async (newRange) => {
        if (newRange && newRange.from < 50 && !AppState.isFetchingHistory && AppState.hasMoreHistory) {
            AppState.isFetchingHistory = true; 
            showToast("Memuat history...", false);
            const reqPair = AppState.g_pair;
            
            try {
                const firstC = AppState.candles[0];
                const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${reqPair}&interval=${AppState.g_tf}&limit=500&endTime=${firstC.time * 1000 - 1}`);
                
                if (AppState.g_pair !== reqPair) return;
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.length > 0) {
                        let oldCandles = data.map(c => ({ time: c[0]/1000, open: +c[1], high: +c[2], low: +c[3], close: +c[4], vol: +c[5], takerVol: +c[9] }));
                        let seen = new Set(AppState.candles.map(c => c.time)); 
                        oldCandles = oldCandles.filter(c => !seen.has(c.time)).sort((a,b) => a.time - b.time);
                        
                        if (oldCandles.length > 0) {
                            AppState.candles = [...oldCandles, ...AppState.candles];
                            rebuildCandleLookup(AppState.candles);
                            if (AppState.candles.length > 1500) { AppState.candles = AppState.candles.slice(-1500); AppState.hasMoreHistory = false; }
                            
                            const currentRange = chart.timeScale().getVisibleLogicalRange();
                            calculateAllIndicators(); 
                            const resInfo = IntelligenceEngine.analyze(AppState.candles.length-1); 
                            applyUIVisuals(resInfo);
                            
                            if (series.candle) series.candle.setData(AppState.candles);
                            let volData = AppState.candles.map(c => ({ time: c.time, value: c.vol, color: c.close >= c.open ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)' }));
                            if (series.vol) series.vol.setData(volData);
                            
                            if (AppState.indicators.rsi.length > 0) { 
                                series.rsi.setData(AppState.indicators.rsi); series.stochK.setData(AppState.indicators.stochK); 
                                series.stochD.setData(AppState.indicators.stochD); series.wr.setData(AppState.indicators.wr);
                            }
                            
                            if (currentRange && Number.isFinite(currentRange.from) && Number.isFinite(currentRange.to)) {
                                requestAnimationFrame(() => { chart.timeScale().setVisibleLogicalRange({ from: currentRange.from + oldCandles.length, to: currentRange.to + oldCandles.length }); });
                            }
                        } else AppState.hasMoreHistory = false; 
                    } else AppState.hasMoreHistory = false; 
                }
            } catch(e) {
                console.error("Fetch history failed", e);
            } finally {
                AppState.isFetchingHistory = false;
            }
        }
    });

    chart.subscribeCrosshairMove(param => {
        if (param.time === undefined || param.point.x < 0 || param.point.x > mainChartDom.clientWidth || param.point.y < 0 || param.point.y > mainChartDom.clientHeight) {
            rsiChart.clearCrosshairPosition();
        } else {
            const rsiValue = rsiLookupByTime.get(param.time) || 50;
            rsiChart.setCrosshairPosition(rsiValue, param.time, series.rsi);
        }
    });

    rsiChart.subscribeCrosshairMove(param => {
        if (param.time === undefined || param.point.x < 0 || param.point.x > rsiChartDom.clientWidth || param.point.y < 0 || param.point.y > rsiChartDom.clientHeight) {
            chart.clearCrosshairPosition();
        } else {
            const cData = candleLookupByTime.get(param.time);
            if (cData) chart.setCrosshairPosition(cData.close, param.time, series.candle);
        }
    });


    const applyChartSize = () => {
        let h = containerDom.clientHeight, w = containerDom.clientWidth;
        if (h === 0 || w === 0 || !chart || !rsiChart) return;
        chart.applyOptions({ width: w, height: Math.max(h - 140, 100) });
        rsiChart.applyOptions({ width: w, height: 140 });
    };

    resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== containerDom) return;
        applyChartSize();
    });
    resizeObserver.observe(containerDom);

    const chartWheelHandler = (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
            event.preventDefault();
        }
    };
    mainChartDom.addEventListener('wheel', chartWheelHandler, { passive: false });
    rsiChartDom.addEventListener('wheel', chartWheelHandler, { passive: false });

    window.addEventListener('resize', () => requestAnimationFrame(applyChartSize), { passive: true });
    window.addEventListener('orientationchange', () => {
        setTimeout(() => requestAnimationFrame(applyChartSize), 100);
    }, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => requestAnimationFrame(applyChartSize), { passive: true });
    }
}

function rebuildCandleLookup(candles) {
    candleLookupByTime = new Map(candles.map(c => [c.time, c]));
}

function renderFullChart() {
    calculateAllIndicators(); 
    const data = AppState.candles;
    const ind = AppState.indicators; 
    rebuildCandleLookup(data);
    let volData = []; 
    AppState.markers = [];
    
    let lastBullBOS = null, lastBearBOS = null;
    
    for (let i = 0; i < data.length; i++) {
        let c = data[i];
        let isUp = c.close >= c.open;
        volData.push({ time: c.time, value: c.vol, color: isUp ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)' });
        
        if (i > 10 && i < data.length - 1 && i > data.length - 50) {
            let rH = AppState.swings.highs.filter(s => s.time < c.time).slice(-1)[0];
            let rL = AppState.swings.lows.filter(s => s.time < c.time).slice(-1)[0];
            let volSpike = c.vol > (AppState.volSMA[i] || 1) * 1.5;
            
            if (rH && c.close > rH.val && isUp && volSpike) lastBullBOS = { time: c.time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'BOS Bull' };
            if (rL && c.close < rL.val && !isUp && volSpike) lastBearBOS = { time: c.time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'BOS Bear' };
        }
    }
    
    if (lastBullBOS) AppState.markers.push(lastBullBOS);
    if (lastBearBOS) AppState.markers.push(lastBearBOS);
    
    if (AppState.swings.highs.length > 0) AppState.markers.push({ time: AppState.swings.highs.slice(-1)[0].time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'Res' });
    if (AppState.swings.lows.length > 0) AppState.markers.push({ time: AppState.swings.lows.slice(-1)[0].time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'Sup' });
    
    AppState.aiSignalMarkers.filter(m => m.pair === AppState.g_pair).forEach(m => AppState.markers.push(m));

    let allMarkers = [...AppState.markers];
    const groupedMarkers = new Map();
    
    allMarkers.forEach(m => {
        let key = m.time + '_' + m.position;
        if (groupedMarkers.has(key)) {
            let existing = groupedMarkers.get(key);
            if (!existing.text.includes(m.text)) existing.text += ' | ' + m.text;
        } else {
            groupedMarkers.set(key, { ...m });
        }
    });
    
    const finalMarkers = Array.from(groupedMarkers.values()).sort((a, b) => a.time - b.time);
    
    if (series.candle) series.candle.setData(data); 
    if (series.vol) series.vol.setData(volData); 
    if (series.candle) series.candle.setMarkers(finalMarkers);
    
    if (ind.rsi.length > 0) { 
        series.rsi.setData(ind.rsi); series.stochK.setData(ind.stochK); 
        series.stochD.setData(ind.stochD); series.wr.setData(ind.wr);
    }
    
    const res = IntelligenceEngine.analyze(data.length-1); 
    applyUIVisuals(res);
    
    polymarketLog.filter(p => p.status === 'PENDING' && p.pair === AppState.g_pair).forEach(p => PolyLineManager.draw(p)); 
    FuturesEngine.drawChartLines();

    if (!isUserPanningChart) smoothScrollToRealtime();
}

function applyUIVisuals(res) {
    let sC = "signal-hold"; 
    if (res.signal === "STRONG BUY") sC = "signal-buy"; 
    else if (res.signal === "STRONG SELL") sC = "signal-sell";
    
    setSafeText('signal', res.signal); 
    const sigEl = document.getElementById('signal'); 
    if (sigEl) sigEl.className = `value-large ${sC}`;
    
    setSafeText('confidence', res.prob > 0 ? res.prob.toFixed(1) + "%" : "0%"); 
    setSafeText('reasoning', `[Model: ${res.dominantStrategy}] ` + res.insightArr.join(" + "));
    setSafeText('badge-regime', res.regime); 
    setSafeText('badge-vol', `Vol: ${res.volRegime}`); 
    setSafeText('badge-liq', `Liq: ${AppState.marketState.liquidity}`); 
    
    const rBadge = document.getElementById('badge-risk');
    if (rBadge) { 
        rBadge.textContent = "RISK: " + res.risk; 
        rBadge.style.color = res.risk === "LOW" ? "var(--color-correct)" : (res.risk === "HIGH" ? "var(--color-wrong)" : "var(--text-secondary)"); 
        rBadge.style.borderColor = rBadge.style.color; 
    }

    const data = AppState.candles;
    const ind = AppState.indicators;
    
    if (data.length > 0) {
        const lIdx = data.length-1; 
        setSafeText('price', formatPrice(data[lIdx].close));
        
        if (ind.st[lIdx]) setSafeText('st-status', ind.st[lIdx].trend === 1 ? '<span class="mtf-badge-container mtf-up-box">UPTREND</span>' : '<span class="mtf-badge-container mtf-dn-box">DOWNTREND</span>', undefined, true);
        if (ind.macd[lIdx]) {
            let mVal = ind.macd[lIdx].value; 
            setSafeText('macd-val', mVal > 0 ? '<span class="mtf-badge-container mtf-up-box">BULLISH</span>' : '<span class="mtf-badge-container mtf-dn-box">BEARISH</span>', undefined, true);
        }
        if (ind.e200[lIdx]) setSafeText('vwap-status', data[lIdx].close > ind.e200[lIdx].value ? '<span class="mtf-badge-container mtf-up-box">ABOVE</span>' : '<span class="mtf-badge-container mtf-dn-box">BELOW</span>', undefined, true);
        if (ind.rsi[lIdx] && ind.rsi21[lIdx]) setSafeText('rsi-val', `<span style="color:#00e5ff">${ind.rsi[lIdx].value.toFixed(1)}</span> / <span style="color:#a1a1aa">${ind.rsi21[lIdx].value.toFixed(1)}</span>`, undefined, true);
        if (ind.stochK[lIdx] && ind.stochD[lIdx]) setSafeText('stoch-val', `<span style="color:#ffff00">${ind.stochK[lIdx].value.toFixed(1)}</span> / <span style="color:#d500f9">${ind.stochD[lIdx].value.toFixed(1)}</span>`, undefined, true);
        if (ind.wr[lIdx]) setSafeText('wr-val', `<span style="color:#ff1744">${ind.wr[lIdx].value.toFixed(1)}</span>`, undefined, true);

        if (AppState.candles.length > 5) {
            let cVolAvg = AppState.volSMA[lIdx] || 0, pVolAvg = AppState.volSMA[lIdx - 5] || 0;
            if (cVolAvg > pVolAvg * 1.05) setSafeText('vol-trend-val', '<span class="mtf-badge-container mtf-up-box">UPTREND</span>', undefined, true);
            else if (cVolAvg < pVolAvg * 0.95) setSafeText('vol-trend-val', '<span class="mtf-badge-container mtf-dn-box">DOWNTREND</span>', undefined, true);
            else setSafeText('vol-trend-val', '<span class="mtf-badge-container mtf-neutral-box">SIDEWAYS</span>', undefined, true);
        }

        if(ind.cvd[lIdx] && ind.obv[lIdx]) setSafeText('cvd-obv-val', `${formatNum(ind.cvd[lIdx].value)} / ${formatNum(ind.obv[lIdx].value)}`);
        if(ind.mfi[lIdx] && ind.volosc[lIdx]) setSafeText('mfi-volosc-val', `${ind.mfi[lIdx].value.toFixed(1)} / ${ind.volosc[lIdx].value.toFixed(1)}`);
        if(ind.bb[lIdx]) setSafeText('bb-val', `${formatPrice(ind.bb[lIdx].lower)} | ${formatPrice(ind.bb[lIdx].upper)}`);
        if(ind.ichimoku[lIdx]) setSafeText('ichi-val', `${formatPrice(ind.ichimoku[lIdx].tenkan)} / ${formatPrice(ind.ichimoku[lIdx].kijun)}`);
        if(ind.poc[lIdx] && ind.psar[lIdx]) setSafeText('poc-psar-val', `${formatPrice(ind.poc[lIdx].value)} / ${formatPrice(ind.psar[lIdx].value)}`);
        if(ind.linreg[lIdx]) setSafeText('linreg-val', `${formatPrice(ind.linreg[lIdx].value)} (S: ${ind.linreg[lIdx].slope.toFixed(4)})`);
    }

    if (res.fData) {
        let sVol = Math.min(1, data[data.length-1].vol / (AppState.volSMA[data.length-1] || 1));
        let dev = (res.fData.retail - 0.5) * sVol; 
        
        setSafeText('rs-val', `${((0.5+dev) * 100).toFixed(1)}% R / ${((0.5-dev) * 100).toFixed(1)}% S`);
        setSafeText('fo-val', `${(res.fData.funding * 100).toFixed(4)}% | ${formatNum(res.fData.oi)}`);
        setSafeText('cf-val', Math.abs(dev*2).toFixed(4));
        setSafeText('taker-val', `${(res.fData.takerRatio || 0).toFixed(2)}`);
        setSafeText('ls-acc-val', `${(res.fData.retail || 0).toFixed(2)}`);
        setSafeText('ls-ratio-val', `${(res.fData.lsRatio || 0).toFixed(2)}`);
        setSafeText('ls-pos-val', `${(res.fData.smart || 0).toFixed(2)}`);
        setSafeText('bs-vol-val', `${(res.fData.takerRatio || 0).toFixed(2)}`);
        
        let dTxt = res.fData.dominance === "LONG" ? '<span class="mtf-badge-container mtf-up-box">LONG</span>' : (res.fData.dominance === "SHORT" ? '<span class="mtf-badge-container mtf-dn-box">SHORT</span>' : '<span class="mtf-badge-container mtf-neutral-box">NEUTRAL</span>');
        setSafeText('dom-ls-val', dTxt, undefined, true);
        
        let basis = res.fData.markPrice > 0 ? (res.fData.markPrice - AppState.price).toFixed(2) : 0;
        setSafeText('oi-basis-val', `${formatNum(res.fData.oi)} / ${basis}`);
    }

    const scoreBar = document.getElementById('score-bar');
    if (scoreBar && Math.abs(res.score) > 10) {
        scoreBar.style.display = 'flex';
        let totalScore = Math.abs(AI_STATS.trend.w) + Math.abs(AI_STATS.liquidity.w) + Math.abs(AI_STATS.whale.w);
        if (totalScore > 0) {
            document.getElementById('sb-trend').style.width = `${(Math.abs(AI_STATS.trend.w) / totalScore) * 100}%`;
            document.getElementById('sb-liq').style.width = `${(Math.abs(AI_STATS.liquidity.w) / totalScore) * 100}%`;
            document.getElementById('sb-whale').style.width = `${(Math.abs(AI_STATS.whale.w) / totalScore) * 100}%`;
        }
    } else if (scoreBar) { 
        scoreBar.style.display = 'none'; 
    }
}
