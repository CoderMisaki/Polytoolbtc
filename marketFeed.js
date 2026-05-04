
class TickCandleAggregator {
    constructor(intervalMs = 60_000) {
        this.intervalMs = intervalMs;
        this.current = null;
    }

    setIntervalMs(intervalMs) {
        this.intervalMs = Math.max(1000, intervalMs || 60_000);
    }

    reset() {
        this.current = null;
    }

    seed(lastCandle) {
        if (!lastCandle) return;
        this.current = {
            time: lastCandle.time,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
            vol: Number(lastCandle.vol) || 0,
            takerVol: Number(lastCandle.takerVol) || 0,
            _bucketStart: Math.floor(lastCandle.time * 1000 / this.intervalMs) * this.intervalMs
        };
    }

    ingest(tick) {
        if (!tick || !Number.isFinite(tick.price) || !Number.isFinite(tick.tsMs)) return null;

        const bucketStart = Math.floor(tick.tsMs / this.intervalMs) * this.intervalMs;
        const bucketTime = bucketStart / 1000;
        const qty = Number.isFinite(tick.qty) && tick.qty > 0 ? tick.qty : 0;
        const takerBuyQty = Number.isFinite(tick.takerBuyQty) && tick.takerBuyQty > 0 ? tick.takerBuyQty : 0;

        if (!this.current) {
            this.current = {
                time: bucketTime,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price,
                vol: qty,
                takerVol: takerBuyQty,
                _bucketStart: bucketStart
            };
            return { candle: { ...this.current }, isClosed: false };
        }

        if (bucketStart < this.current._bucketStart) {
            return null;
        }

        if (bucketStart > this.current._bucketStart) {
            this.current = {
                time: bucketTime,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price,
                vol: qty,
                takerVol: takerBuyQty,
                _bucketStart: bucketStart
            };
            return { candle: { ...this.current }, isClosed: true };
        }

        this.current.high = Math.max(this.current.high, tick.price);
        this.current.low = Math.min(this.current.low, tick.price);
        this.current.close = tick.price;
        this.current.vol += qty;
        this.current.takerVol += takerBuyQty;

        return { candle: { ...this.current }, isClosed: false };
    }
}

class MarketFeedManager {
    constructor() {
        this.sources = {
            BINANCE: {
                name: 'BINANCE',
                label: 'Binance',
                urlFor: (pair, tf) => `wss://fstream.binance.com/market/ws/${pair.toLowerCase()}@aggTrade`,
                socket: null,
                reconnectTimer: null,
                reconnectDelay: 1000,
                ready: false,
                lastReceiveMs: 0,
                lastServerTs: 0,
                lastPrice: 0,
                latencyMs: Infinity,
                samples: 0,
                staleCount: 0,
                status: 'DISCONNECTED'
            },
            BYBIT: {
                name: 'BYBIT',
                label: 'Bybit',
                urlFor: () => `wss://stream.bybit.com/v5/public/linear`,
                socket: null,
                reconnectTimer: null,
                reconnectDelay: 1000,
                ready: false,
                lastReceiveMs: 0,
                lastServerTs: 0,
                lastPrice: 0,
                latencyMs: Infinity,
                samples: 0,
                staleCount: 0,
                status: 'DISCONNECTED'
            }
        };
        this.pair = null;
        this.tf = '15m';
        this.activeSource = 'BINANCE';
        this.booted = false;
        this.aggregator = new TickCandleAggregator(15 * 60 * 1000);
        this._switchHistory = [];
        this._healthTimer = null;
        this._session = 0;
        this.callbacks = {
            onTick: null,
            onStatus: null
        };
    }

    static tfToMs(tf) {
        const map = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
        return map[tf] || 900_000;
    }

    setCallbacks(callbacks = {}) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    start({ pair, tf, history = [] } = {}) {
        if (!pair) return;
        this.stop();
        this.pair = pair;
        this.tf = tf || '15m';
        this.aggregator = new TickCandleAggregator(MarketFeedManager.tfToMs(this.tf));
        if (Array.isArray(history) && history.length > 0) {
            this.aggregator.seed(history[history.length - 1]);
        }
        this._session += 1;
        this.booted = true;
        this._emitStatus({ status: 'CONNECTING', activeSource: this.activeSource, pair: this.pair, tf: this.tf });
        this._connect('BINANCE', this._session);
        this._connect('BYBIT', this._session);
        this._healthTimer = setInterval(() => this._evaluateHealth(this._session), 700);
    }

    stop() {
        this._clearReconnect('BINANCE');
        this._clearReconnect('BYBIT');
        for (const key of Object.keys(this.sources)) {
            const src = this.sources[key];
            if (src.socket) {
                try { src.socket.close(); } catch (_) {}
            }
            src.socket = null;
            src.ready = false;
            src.status = 'DISCONNECTED';
            src.latencyMs = Infinity;
            src.samples = 0;
            src.staleCount = 0;
        }
        if (this._healthTimer) {
            clearInterval(this._healthTimer);
            this._healthTimer = null;
        }
    }

    _clearReconnect(name) {
        const src = this.sources[name];
        if (src && src.reconnectTimer) {
            clearTimeout(src.reconnectTimer);
            src.reconnectTimer = null;
        }
    }

    _scheduleReconnect(name, session, reason = 'reconnect') {
        const src = this.sources[name];
        if (!src || session !== this._session) return;
        this._clearReconnect(name);
        src.reconnectDelay = Math.min(Math.max(src.reconnectDelay * 1.5, 1000), 15_000);
        src.status = reason === 'error' ? 'ERROR' : 'RECONNECTING';
        this._emitStatus({ status: src.status, activeSource: this.activeSource, pair: this.pair, tf: this.tf });
        src.reconnectTimer = setTimeout(() => this._connect(name, session), src.reconnectDelay);
    }

    _connect(name, session) {
        if (session !== this._session || !this.pair) return;
        const src = this.sources[name];
        if (!src) return;
        this._clearReconnect(name);
        if (src.socket) {
            try { src.socket.close(); } catch (_) {}
            src.socket = null;
        }

        let ws = null;
        if (name === 'BINANCE') {
            const url = src.urlFor(this.pair, this.tf);
            ws = new WebSocket(url);
            ws.onopen = () => {
                src.ready = true;
                src.status = 'LIVE';
                src.reconnectDelay = 1000;
                src.lastReceiveMs = performance.now();
                this._emitStatus({ status: 'LIVE', source: 'BINANCE', activeSource: this.activeSource, pair: this.pair, tf: this.tf });
            };
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (!msg || msg.s !== this.pair || !Number.isFinite(+msg.p)) return;
                    const receiveMs = performance.now();
                    const tsMs = Number(msg.T || msg.E || Date.now());
                    this._handleTick('BINANCE', {
                        price: +msg.p,
                        qty: +msg.q || 0,
                        takerBuyQty: msg.m ? 0 : (+msg.q || 0),
                        tsMs,
                        receiveMs,
                        raw: msg
                    });
                } catch (err) {
                    console.warn('BINANCE feed parse failed', err);
                }
            };
            ws.onerror = () => {
                src.status = 'ERROR';
                this._emitStatus({ status: 'ERROR', source: 'BINANCE', activeSource: this.activeSource, pair: this.pair, tf: this.tf });
            };
            ws.onclose = () => {
                src.ready = false;
                src.socket = null;
                src.status = 'DISCONNECTED';
                this._emitStatus({ status: 'DISCONNECTED', source: 'BINANCE', activeSource: this.activeSource, pair: this.pair, tf: this.tf });
                this._scheduleReconnect('BINANCE', session, 'close');
            };
            src.socket = ws;
            return;
        }

        if (name === 'BYBIT') {
            const url = src.urlFor(this.pair, this.tf);
            ws = new WebSocket(url);
            ws.onopen = () => {
                src.ready = true;
                src.status = 'LIVE';
                src.reconnectDelay = 1000;
                src.lastReceiveMs = performance.now();
                try {
                    ws.send(JSON.stringify({ op: 'subscribe', args: [`publicTrade.${this.pair}`] }));
                } catch (_) {}
                this._emitStatus({ status: 'LIVE', source: 'BYBIT', activeSource: this.activeSource, pair: this.pair, tf: this.tf });
            };
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (!msg || msg.topic !== `publicTrade.${this.pair}` || !Array.isArray(msg.data)) return;
                    const receiveMs = performance.now();
                    const serverTs = Number(msg.ts || Date.now());
                    for (const t of msg.data) {
                        const price = Number(t.p || t.price);
                        if (!Number.isFinite(price)) continue;
                        const qty = Number(t.v || t.size || t.q || 0) || 0;
                        const side = String(t.S || t.side || '').toLowerCase();
                        const takerBuyQty = side === 'buy' ? qty : 0;
                        const tsMs = Number(t.T || t.ts || serverTs || Date.now());
                        this._handleTick('BYBIT', {
                            price,
                            qty,
                            takerBuyQty,
                            tsMs,
                            receiveMs,
                            raw: t,
                            serverTs
                        });
                    }
                } catch (err) {
                    console.warn('BYBIT feed parse failed', err);
                }
            };
            ws.onerror = () => {
                src.status = 'ERROR';
                this._emitStatus({ status: 'ERROR', source: 'BYBIT', activeSource: this.activeSource, pair: this.pair, tf: this.tf });
            };
            ws.onclose = () => {
                src.ready = false;
                src.socket = null;
                src.status = 'DISCONNECTED';
                this._emitStatus({ status: 'DISCONNECTED', source: 'BYBIT', activeSource: this.activeSource, pair: this.pair, tf: this.tf });
                this._scheduleReconnect('BYBIT', session, 'close');
            };
            src.socket = ws;
        }
    }

    _handleTick(sourceName, tick) {
        const src = this.sources[sourceName];
        if (!src || !Number.isFinite(tick.price)) return;

        src.ready = true;
        src.status = 'LIVE';
        src.lastReceiveMs = tick.receiveMs || performance.now();
        src.lastServerTs = tick.tsMs || Number(tick.serverTs || tick.receiveMs || Date.now());
        src.lastPrice = tick.price;
        src.latencyMs = Math.max(0, (tick.receiveMs || performance.now()) - src.lastServerTs);
        src.samples += 1;
        src.staleCount = 0;

        if (window.AppState) {
            AppState.venueQuotes[sourceName] = {
                price: tick.price,
                tsMs: src.lastServerTs,
                latencyMs: src.latencyMs,
                receiveMs: src.lastReceiveMs
            };
        }

        const switched = this._maybeSwitchActiveSource();
        if (sourceName !== this.activeSource && !switched) {
            this._emitStatus(this._buildStatusPayload());
            return;
        }

        const out = this.aggregator.ingest(tick);
        if (!out || !out.candle) {
            this._emitStatus(this._buildStatusPayload());
            return;
        }

        const other = this.activeSource === 'BINANCE' ? 'BYBIT' : 'BINANCE';
        const otherQuote = AppState?.venueQuotes?.[other];
        const spreadPct = otherQuote && Number.isFinite(otherQuote.price)
            ? (Math.abs(otherQuote.price - tick.price) / ((otherQuote.price + tick.price) / 2)) * 100
            : 0;

        const payload = {
            ...out.candle,
            isClosed: out.isClosed,
            source: sourceName,
            latencyMs: src.latencyMs,
            spreadPct,
            sourceQuotes: {
                BINANCE: AppState?.venueQuotes?.BINANCE || null,
                BYBIT: AppState?.venueQuotes?.BYBIT || null
            }
        };
        this._emitTick(payload, this._buildStatusPayload({ spreadPct }));
    }

    _buildStatusPayload(extra = {}) {
        const bin = this.sources.BINANCE;
        const byb = this.sources.BYBIT;
        const active = this.sources[this.activeSource] || bin;
        const spreadPct = Number.isFinite(extra.spreadPct)
            ? extra.spreadPct
            : (AppState?.venueQuotes?.BINANCE?.price && AppState?.venueQuotes?.BYBIT?.price)
                ? (Math.abs(AppState.venueQuotes.BINANCE.price - AppState.venueQuotes.BYBIT.price) / ((AppState.venueQuotes.BINANCE.price + AppState.venueQuotes.BYBIT.price) / 2)) * 100
                : 0;
        return {
            status: active?.status || 'WAIT',
            activeSource: this.activeSource,
            primarySource: this.activeSource,
            pair: this.pair,
            tf: this.tf,
            latencyMs: active?.latencyMs || 0,
            spreadPct,
            binance: {
                status: bin.status,
                latencyMs: Number.isFinite(bin.latencyMs) ? bin.latencyMs : 0,
                price: bin.lastPrice || 0
            },
            bybit: {
                status: byb.status,
                latencyMs: Number.isFinite(byb.latencyMs) ? byb.latencyMs : 0,
                price: byb.lastPrice || 0
            }
        };
    }

    _emitTick(candle, statusPayload = null) {
        if (typeof this.callbacks.onTick === 'function') {
            this.callbacks.onTick(candle, statusPayload || this._buildStatusPayload());
        }
        this._emitStatus(statusPayload || this._buildStatusPayload());
    }

    _emitStatus(payload = {}) {
        if (typeof this.callbacks.onStatus === 'function') {
            this.callbacks.onStatus(payload);
        }
    }

    _healthyScore(src) {
        if (!src || !src.ready || !Number.isFinite(src.lastReceiveMs)) return Infinity;
        const staleMs = performance.now() - src.lastReceiveMs;
        const stalePenalty = Math.max(0, staleMs - 1000) * 0.35;
        return (Number.isFinite(src.latencyMs) ? src.latencyMs : 9999) + stalePenalty;
    }

    _maybeSwitchActiveSource() {
        const bin = this.sources.BINANCE;
        const byb = this.sources.BYBIT;
        const active = this.sources[this.activeSource];
        const activeScore = this._healthyScore(active);
        const binScore = this._healthyScore(bin);
        const bybScore = this._healthyScore(byb);
        const bestSource = binScore <= bybScore ? 'BINANCE' : 'BYBIT';
        const best = this.sources[bestSource];
        const activeStale = active ? (performance.now() - (active.lastReceiveMs || 0)) : Infinity;
        const bestStale = best ? (performance.now() - (best.lastReceiveMs || 0)) : Infinity;

        const shouldSwitch =
            !active ||
            !active.ready ||
            activeStale > 2500 ||
            (!Number.isFinite(activeScore) || !Number.isFinite(best ? this._healthyScore(best) : Infinity) ? false : (this._healthyScore(best) + 75 < activeScore && bestStale < 2500));

        if (shouldSwitch && best && best.ready && best.lastPrice > 0 && bestSource !== this.activeSource) {
            this.activeSource = bestSource;
            this._switchHistory.push({ at: Date.now(), activeSource: this.activeSource });
            if (this._switchHistory.length > 20) this._switchHistory.shift();
            this._emitStatus(this._buildStatusPayload({ status: 'SWITCHED' }));
            return true;
        }
        return false;
    }

    _evaluateHealth(session) {
        if (session !== this._session) return;
        const active = this.sources[this.activeSource];
        if (active && active.ready && (performance.now() - active.lastReceiveMs) < 3000) {
            this._emitStatus(this._buildStatusPayload());
            return;
        }
        this._maybeSwitchActiveSource();
        this._emitStatus(this._buildStatusPayload());
    }
}

window.MarketFeedManager = MarketFeedManager;
