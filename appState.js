const APP_SCHEMA_VERSION = '1.2.0';

function setState(partial) {
    if (partial && typeof partial === 'object') {
        Object.assign(AppState, partial);
    }
    return AppState;
}

const FEES = { 
    TAKER: 0.0004, 
    MAKER: 0.0002, 
    SLIPPAGE: 0.0002 
};

const AppState = {
    wsKline: null, 
    reconnectTimer: null, 
    isIntentionalClose: false, 
    candles: [], 
    indicators: { 
        e21: [], e55: [], e200: [], 
        stUp: [], stDown: [], st: [], vwap: [], 
        rsi: [], rsi21: [], stochK: [], stochD: [], wr: [], adx: [], macd: [], 
        bb: [], donchian: [], obv: [], cvd: [], psar: [], mfi: [], linreg: [], 
        volosc: [], ichimoku: [], pivots: [], poc: [] 
    },
    volSMA: [], 
    atrSMA: [], 
    swings: { highs: [], lows: [] }, 
    markers: [], 
    aiSignalMarkers: [], 
    mtf: { '1d': 'WAIT', '1h': 'WAIT', '15m': 'WAIT' },
    fusionBase: { retail: 0.5, smart: 0.5, lsRatio: 1, oi: 0, funding: 0, conflict: 0, markPrice: 0, takerRatio: 0.5, dominance: 'NEUTRAL' }, 
    fusion: null, 
    currentFilter: 'FUTURES', 
    syncingScales: false, 
    retryCount: 0, 
    price: 0, 
    lastPrices: {}, 
    lastMathTime: 0, 
    smoothedScore: 0, 
    smoothedProb: 0, 
    g_pair: "BTCUSDT", 
    g_tf: "15m", 
    g_base: "BTC", 
    aiMode: 'CONS', 
    marketState: { regime: 'ANALYSING', volatility: 'NORMAL', liquidity: 'NORMAL', sentiment: 'NEUTRAL' },
    drawdownGuard: safeLoad('masako_dd_guard_v44', { lossStreak: 0 }), 
    isFetchingHistory: false, 
    hasMoreHistory: true, 
    actionPosId: null,
    schemaVersion: APP_SCHEMA_VERSION,
    live: { price: 0, score: 0, signal: 'WAIT', prevSignal: 'WAIT', type: 'WAIT', risk: 'MED', prob: 0, insightArr: [], dominantStrategy: 'NONE', atr: 0, age: 0 }
};

let polymarketLog = safeLoad('masako_poly_v44', []);
let futuresLog = safeLoad('masako_flog_v44', []);
let AI_STATS = safeLoad('masako_ai_stats_v44', { 
    trend: { wins: 0, losses: 0, grossPnL: 0, maxDD: 0, w: 1.0, status: 'ACTIVE' }, 
    meanRev: { wins: 0, losses: 0, grossPnL: 0, maxDD: 0, w: 1.0, status: 'ACTIVE' }, 
    breakout: { wins: 0, losses: 0, grossPnL: 0, maxDD: 0, w: 1.0, status: 'ACTIVE' }, 
    liquidity: { wins: 0, losses: 0, grossPnL: 0, maxDD: 0, w: 1.0, status: 'ACTIVE' }, 
    whale: { wins: 0, losses: 0, grossPnL: 0, maxDD: 0, w: 1.0, status: 'ACTIVE' } 
});

function recalcAiWeights() {
    for (let key in AI_STATS) {
        let s = AI_STATS[key];
        let total = s.wins + s.losses; 
        
        if (total < 5) continue; 
        
        let wr = safeDiv(s.wins, total);
        let avgPnl = safeDiv(s.grossPnL, total);
        let ddPenalty = s.maxDD > 0 ? (s.maxDD / 100) : 0.01;
        
        let sampleFactor = Math.min(1, total / 20);
        let rawWeight = ((wr * Math.max(avgPnl, 0.1)) / (1 + ddPenalty)) * sampleFactor;
        s.w = Math.max(0.1, Math.min(3.0, rawWeight * 10)); 
        
        if (s.losses > 10 && wr < 0.4) { 
            s.status = 'DISABLED'; 
            s.w = 0; 
        } else if (wr > 0.65 && total > 20) { 
            s.status = 'BOOSTED'; 
            s.w *= 1.5; 
        } else { 
            s.status = 'ACTIVE'; 
        }
    }
    safeStore('masako_ai_stats_v44', AI_STATS, APP_SCHEMA_VERSION); 
    if (typeof updateLedgerUI === 'function') updateLedgerUI();
}
window.setState = setState;
window.APP_SCHEMA_VERSION = APP_SCHEMA_VERSION;
