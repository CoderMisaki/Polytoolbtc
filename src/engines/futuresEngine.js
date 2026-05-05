function validateTrade(type, amount, leverage, marginMode = 'ISOLATED') { 
    if (!AppState.price || AppState.price <= 0) { 
        showToast("Data market belum siap.", true); 
        return false; 
    } 
    if (FuturesEngine.state.balance <= 0 || isNaN(FuturesEngine.state.balance)) { 
        showToast("Saldo habis. Silakan reset saldo.", true); 
        return false; 
    } 
    if (isNaN(amount) || amount <= 0) { 
        showToast("Margin tidak valid.", true); 
        return false; 
    }

    let estFee = amount * leverage * FEES.TAKER;
    if (marginMode === 'ISOLATED') {
        if ((amount + estFee) > FuturesEngine.state.balance) { 
            showToast("Margin tidak valid / Saldo kurang untuk margin + fee.", true); 
            return false; 
        }
    } else if (estFee > FuturesEngine.state.balance) {
        showToast("Saldo kurang untuk fee entry.", true); 
        return false; 
    }

    if (FuturesEngine.state.positions.length >= 5) { 
        showToast("Maksimal 5 posisi aktif.", true); 
        return false; 
    } 
    return true; 
}

function getTotalUnrealizedEquity(priceMap = null, baseBalance = FuturesEngine.state.balance) {
    let eq = baseBalance;
    let unPnl = 0; 
    if (FuturesEngine.state.positions && FuturesEngine.state.positions.length > 0) { 
        FuturesEngine.state.positions.forEach((p) => { 
            if (p.marginMode === 'ISOLATED') {
                eq += p.margin; 
            }
            let cP = priceMap && typeof priceMap === 'object' && !Array.isArray(priceMap)
                ? (priceMap[p.pair] ?? (p.pair === AppState.g_pair ? AppState.price : (AppState.lastPrices[p.pair] || p.entryPrice)))
                : ((p.pair === AppState.g_pair) ? AppState.price : (AppState.lastPrices[p.pair] || p.entryPrice)); 
            if (cP > 0) { 
                let rawPnl = p.type === 'LONG' ? (cP - p.entryPrice) * p.sizeBase : (p.entryPrice - cP) * p.sizeBase; 
                unPnl += rawPnl; 
            } 
        }); 
    } 
    return eq + unPnl; 
}

const FuturesEngine = {
    state: safeLoad('masako_futures_state_v44', { balance: 10000, positions: [] }),
    posLines: {}, 
    MM_RATE: 0.005, 
    
    save() { 
        safeStore('masako_futures_state_v44', this.state, APP_SCHEMA_VERSION); 
        safeStore('masako_flog_v44', futuresLog, APP_SCHEMA_VERSION); 
        this.updateUI(); 
    },
    
    setCustomBalance() { 
        let val = prompt("Atur Saldo Demo USDT:", this.state.balance.toFixed(2)); 
        if (val !== null) { 
            let amount = parseFloat(val); 
            if (!isNaN(amount) && amount >= 0) { 
                this.state.balance = amount; 
                this.save(); 
                showToast(`Saldo diatur ke $${amount}`); 
            } else { 
                showToast("Nominal tidak valid!", true); 
            } 
        } 
    },

    calculateLiqPrice(pos, currentBalance) { 
        const markPrice = (pos.pair === AppState.g_pair) ? AppState.price : (AppState.lastPrices[pos.pair] || pos.entryPrice);
        let mm = pos.sizeBase * pos.entryPrice * this.MM_RATE;
        let liq = 0; 
        
        if (pos.marginMode === 'ISOLATED') {
            liq = pos.type === 'LONG' ? pos.entryPrice - safeDiv((pos.margin - mm), pos.sizeBase) : pos.entryPrice + safeDiv((pos.margin - mm), pos.sizeBase); 
        } else { 
            let totalEq = getTotalUnrealizedEquity({ [pos.pair]: markPrice }, Number.isFinite(currentBalance) ? currentBalance : this.state.balance);
            liq = pos.type === 'LONG' ? pos.entryPrice - safeDiv((totalEq - mm), pos.sizeBase) : pos.entryPrice + safeDiv((totalEq - mm), pos.sizeBase); 
        } 
        return liq < 0 ? 0 : liq; 
    },
    
    getHedgeBuckets(pair = AppState.g_pair) {
        const related = this.state.positions.filter(p => p.pair === pair && p.autoHedgeTrail);
        return {
            longs: related.filter(p => p.type === 'LONG'),
            shorts: related.filter(p => p.type === 'SHORT')
        };
    },
    
    checkOfflineHits() {
        if (this.state.positions.length === 0) return;
        const candles = [...AppState.candles].sort((a, b) => a.time - b.time); 
        if (candles.length === 0) return;
        
        const tempPositions = this.state.positions.map(p => ({ ...p, _closed: false }));
        let tempBalance = this.state.balance;
        const toClose = [];

        const simulateClose = (pos, isLiquidated, closePrice, closeTimeSec, closeReason) => {
            const closeRatio = 1;
            const realizedSizeBase = pos.sizeBase * closeRatio;
            const closeFee = (realizedSizeBase * closePrice) * FEES.TAKER;
            const rawPnl = pos.type === 'LONG' ? (closePrice - pos.entryPrice) * realizedSizeBase : (pos.entryPrice - closePrice) * realizedSizeBase;
            let netPnlAbs = rawPnl - closeFee;
            const realizedMargin = pos.margin * closeRatio;

            if (!isLiquidated) {
                const returnedMargin = pos.marginMode === 'ISOLATED' ? realizedMargin + netPnlAbs : netPnlAbs;
                tempBalance += returnedMargin;
            } else if (pos.marginMode === 'CROSS') {
                tempBalance = 0;
            }
            toClose.push({ id: pos.id, isLiq: isLiquidated, reason: closeReason, price: closePrice, time: closeTimeSec });
            pos._closed = true;
        };
        
        for (let c of candles) {
            const candleMs = c.time * 1000;
            const active = tempPositions
                .filter(pos => !pos._closed && !pos.sentToBackend && candleMs > pos.openTime)
                .sort((a, b) => a.openTime - b.openTime);

            for (const pos of active) {
                const liqP = this.calculateLiqPrice(pos, tempBalance);
                if (pos.type === 'LONG') {
                    if (c.low <= liqP) { simulateClose(pos, true, liqP, c.time, 'LIQUIDATED (OFFLINE)'); continue; }
                    if (pos.sl && c.low <= pos.sl) { simulateClose(pos, false, pos.sl, c.time, 'STOP LOSS (OFFLINE)'); continue; }
                    if (pos.tp && c.high >= pos.tp) { simulateClose(pos, false, pos.tp, c.time, 'TAKE PROFIT (OFFLINE)'); continue; }
                } else {
                    if (c.high >= liqP) { simulateClose(pos, true, liqP, c.time, 'LIQUIDATED (OFFLINE)'); continue; }
                    if (pos.sl && c.high >= pos.sl) { simulateClose(pos, false, pos.sl, c.time, 'STOP LOSS (OFFLINE)'); continue; }
                    if (pos.tp && c.low <= pos.tp) { simulateClose(pos, false, pos.tp, c.time, 'TAKE PROFIT (OFFLINE)'); continue; }
                }
            }
        }
        
        toClose
            .sort((a, b) => b.time - a.time)
            .forEach(c => this.closePosition(c.id, c.isLiq, c.reason, 100, c.price, c.time, true));
    },

    openPosition(type, isAi = false) {
        const amountInput = parseFloat(document.getElementById('trade-amount').value);
        const leverage = parseInt(document.getElementById('leverage-slider').value);
        const marginMode = document.getElementById('margin-mode').value;
        
        if (!validateTrade(type, amountInput, leverage, marginMode)) return;
        const useTrailing = document.getElementById('use-trailing').checked;
        const useBe = document.getElementById('use-be').checked;
        const useAutoRr = document.getElementById('auto-rr-manual') ? document.getElementById('auto-rr-manual').checked : false;
        
        let entryPrice = type === 'LONG' ? AppState.price * (1 + FEES.SLIPPAGE) : AppState.price * (1 - FEES.SLIPPAGE);
        const sizeBase = safeDiv((amountInput * leverage), entryPrice); 
        let execFee = amountInput * leverage * FEES.TAKER;
        
        let finalTP = null;
        let finalSL = null;

        if (isAi || useAutoRr) {
            let atr = AppState.live.atr || (AppState.price * 0.01);
            let mTP = AppState.live.risk === "HIGH" ? 3 : (AppState.live.risk === "LOW" ? 1.5 : 2);
            let mSL = AppState.live.risk === "HIGH" ? 1.5 : (AppState.live.risk === "LOW" ? 0.7 : 1);
            finalTP = type === "LONG" ? entryPrice + (atr * mTP) : entryPrice - (atr * mTP); 
            finalSL = type === "LONG" ? entryPrice - (atr * mSL) : entryPrice + (atr * mSL);
        } else {
            let manTpPx = parseFloat(document.getElementById('tp-price').value);
            let tpPctSel = document.getElementById('tp-pct-sel').value;
            let tpPct = tpPctSel === 'custom' ? parseFloat(document.getElementById('tp-pct-custom').value) : parseFloat(tpPctSel);
            
            let manSlPx = parseFloat(document.getElementById('sl-price').value);
            let slPctSel = document.getElementById('sl-pct-sel').value;
            let slPct = slPctSel === 'custom' ? parseFloat(document.getElementById('sl-pct-custom').value) : parseFloat(slPctSel);
            
            if (!isNaN(manTpPx) && manTpPx > 0) {
                finalTP = manTpPx; 
            } else if (!isNaN(tpPct)) { 
                let offset = entryPrice * ((Math.abs(tpPct) / 100) / leverage); 
                finalTP = type === 'LONG' ? entryPrice + offset : entryPrice - offset; 
            }
            
            if (!isNaN(manSlPx) && manSlPx > 0) {
                finalSL = manSlPx; 
            } else if (!isNaN(slPct)) { 
                let offset = entryPrice * ((Math.abs(slPct) / 100) / leverage); 
                finalSL = type === 'LONG' ? entryPrice - offset : entryPrice + offset; 
            }
        }

        if (finalTP && ((type === 'LONG' && finalTP <= entryPrice) || (type === 'SHORT' && finalTP >= entryPrice))) { 
            showToast("Peringatan: TP di sisi rugi, diabaikan.", true); 
            finalTP = null; 
        }
        if (finalSL && ((type === 'LONG' && finalSL >= entryPrice) || (type === 'SHORT' && finalSL <= entryPrice))) { 
            showToast("Peringatan: SL di sisi profit, diabaikan.", true); 
            finalSL = null; 
        }

        if (marginMode === 'ISOLATED') {
            this.state.balance -= (amountInput + execFee); 
        } else {
            this.state.balance -= execFee;
        }

        const tsActInput = parseFloat(document.getElementById('ts-activation').value);
        const tsCallInput = parseFloat(document.getElementById('ts-callback').value);

        const newPos = { 
            id: Date.now(), 
            pair: AppState.g_pair, 
            type: type, 
            entryPrice: entryPrice, 
            margin: amountInput, 
            leverage: leverage, 
            marginMode: marginMode, 
            sizeBase: sizeBase, 
            sizeUsd: amountInput * leverage, 
            isAi: isAi, 
            openTime: Date.now(), 
            tp: finalTP, 
            sl: finalSL, 
            dominantStrategy: AppState.live.dominantStrategy, 
            maxFavorablePrice: entryPrice, 
            useTrailing: useTrailing, 
            useBe: useBe, 
            autoHedgeTrail: document.getElementById('use-hedge-ts') ? document.getElementById('use-hedge-ts').checked : false,
            beLocked: false,
            atrSnapshot: AppState.live.atr,
            tsActivation: isNaN(tsActInput) || tsActInput <= 0 ? null : tsActInput,
            tsCallback: isNaN(tsCallInput) || tsCallInput <= 0 ? null : tsCallInput,
            tsIsActive: false,
            tsExtremePrice: entryPrice,
            hedgeLinked: false,
            sentToBackend: false
        };
        this.state.positions.push(newPos); 
        this.save(); 

        const backendPositionPayload = {
            id: newPos.id,
            type: newPos.type,
            sl: newPos.sl,
            tp: newPos.tp,
            entryPrice: newPos.entryPrice
        };

        fetch('https://polytoolbtc.vercel.app/api/save-position', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(backendPositionPayload)
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const savedPos = this.state.positions.find(p => p.id === newPos.id);
                if (savedPos) {
                    savedPos.sentToBackend = true;
                    this.save();
                }
            })
            .catch((error) => {
                console.error('Gagal menyimpan posisi ke backend:', error);
            });
        
        AppState.aiSignalMarkers = [{ 
            pair: AppState.g_pair, 
            time: Math.floor(Date.now()/1000), 
            position: type==='LONG'?'belowBar':'aboveBar', 
            color: type==='LONG'?'#fbbf24':'#ef4444', 
            shape: type==='LONG'?'arrowUp':'arrowDown', 
            text: type 
        }];
        
        if (typeof scheduleChartRender === 'function') scheduleChartRender(); 
        else renderFullChart(); 
        this.drawChartLines(); 
        if (typeof updateEquityDisplay === 'function') updateEquityDisplay();
        showToast(`Posisi ${type} Terbuka!`);
    },
    
    closePosition(id, isLiquidated = false, closeReason = "CLOSED", closePct = 100, forcedPrice = null, forcedTime = null, isOfflineClose = false) {
        const idx = this.state.positions.findIndex(p => p.id === id); 
        if (idx === -1) return;
        
        const pos = this.state.positions[idx];
        let exitPrice = forcedPrice !== null ? forcedPrice : (pos.type === 'LONG' ? AppState.price * (1 - FEES.SLIPPAGE) : AppState.price * (1 + FEES.SLIPPAGE));
        let closeTime = isOfflineClose ? Date.now() : (forcedTime !== null ? forcedTime * 1000 : Date.now());

        let closeRatio = closePct / 100;
        let realizedSizeBase = pos.sizeBase * closeRatio;
        
        let closeFee = (realizedSizeBase * exitPrice) * FEES.TAKER;
        let rawPnl = pos.type === 'LONG' ? (exitPrice - pos.entryPrice) * realizedSizeBase : (pos.entryPrice - exitPrice) * realizedSizeBase;
        let netPnlAbs = rawPnl - closeFee;
        
        let realizedMargin = pos.margin * closeRatio;
        
        if (!isLiquidated) { 
            let returnedMargin = pos.marginMode === 'ISOLATED' ? realizedMargin + netPnlAbs : netPnlAbs; 
            this.state.balance += returnedMargin; 
            showToast(`Ditutup (${closePct}%). PNL: $${netPnlAbs.toFixed(2)}`); 
        } else { 
            if (pos.marginMode === 'CROSS') { 
                netPnlAbs = -this.state.balance - pos.margin; 
                this.state.balance = 0; 
            } else { 
                netPnlAbs = -pos.margin; 
            } 
            showToast(`⚠️ LIQUIDATED!`, true); 
            closePct = 100; 
        }

        if (netPnlAbs < 0) {
            AppState.drawdownGuard.lossStreak++; 
        } else {
            AppState.drawdownGuard.lossStreak = 0;
        }
        safeStore('masako_dd_guard_v44', AppState.drawdownGuard, APP_SCHEMA_VERSION);

        let fLog = { 
            id: pos.id, 
            pair: pos.pair, 
            type: pos.type, 
            entryPrice: pos.entryPrice, 
            exitPrice: exitPrice, 
            margin: realizedMargin, 
            leverage: pos.leverage, 
            marginMode: pos.marginMode, 
            pnl: netPnlAbs, 
            openTime: pos.openTime, 
            closeTime: closeTime, 
            status: isLiquidated ? 'LIQ' : `${closePct}% CLOSED`, 
            closeReason: isLiquidated ? 'LIQUIDATION' : closeReason, 
            isAi: pos.isAi, 
            dominantStrategy: pos.dominantStrategy 
        };
        futuresLog.unshift(fLog); 
        if (futuresLog.length > 200) futuresLog = futuresLog.slice(0, 200);
        
        if (pos.isAi && pos.dominantStrategy && pos.dominantStrategy !== 'NONE') {
            const strat = pos.dominantStrategy;
            if (AI_STATS[strat]) { 
                if (netPnlAbs > 0) { 
                    AI_STATS[strat].wins++; 
                    AI_STATS[strat].grossPnL += netPnlAbs; 
                } else { 
                    AI_STATS[strat].losses++; 
                    AI_STATS[strat].grossPnL += netPnlAbs; 
                    AI_STATS[strat].maxDD = Math.max(AI_STATS[strat].maxDD, Math.abs(netPnlAbs) / realizedMargin); 
                } 
                recalcAiWeights(); 
            }
        }

        if (closePct >= 100) { 
            this.state.positions.splice(idx, 1); 
            this.removeChartLine(id); 
            this.activateHedgeMate(pos, exitPrice, closeReason);
            
            if (forcedTime === null) { 
                AppState.aiSignalMarkers.push({ 
                    pair: pos.pair, 
                    time: Math.floor(closeTime/1000), 
                    position: 'inBar', 
                    color: '#a1a1aa', 
                    shape: 'circle', 
                    text: 'CLOSE' 
                }); 
                if(AppState.aiSignalMarkers.length > 200) {
                    AppState.aiSignalMarkers = AppState.aiSignalMarkers.slice(-200);
                }
            }
            if (typeof scheduleChartRender === 'function') scheduleChartRender(true);
            else renderFullChart();
        } else { 
            pos.margin -= realizedMargin; 
            pos.sizeUsd -= (pos.sizeUsd * closeRatio); 
            pos.sizeBase -= realizedSizeBase; 
        }
        this.save(); 
        
        if (typeof updateEquityDisplay === 'function') updateEquityDisplay();
        if (typeof updateLedgerUI === 'function') updateLedgerUI();
    },

    getHedgeMate(pos) {
        if (!pos || !pos.autoHedgeTrail) return null;
        const buckets = this.getHedgeBuckets(pos.pair);
        const opposite = pos.type === 'LONG' ? buckets.shorts : buckets.longs;
        return opposite.find(p => p.id !== pos.id) || null;
    },

    syncHedgeTrailingState(pos, currentPrice) {
        const buckets = this.getHedgeBuckets(pos.pair);
        const longBucket = buckets.longs;
        const shortBucket = buckets.shorts;
        if (longBucket.length === 0 || shortBucket.length === 0) return;

        const sharedCallback = Math.max(
            0.1,
            ...longBucket.map(p => Number.isFinite(p.tsCallback) && p.tsCallback > 0 ? p.tsCallback : 0),
            ...shortBucket.map(p => Number.isFinite(p.tsCallback) && p.tsCallback > 0 ? p.tsCallback : 0)
        ) || 1;

        longBucket.forEach(longPos => {
            shortBucket.forEach(shortPos => {
                const longActivation = Number.isFinite(shortPos.sl) && shortPos.sl > 0 ? shortPos.sl : shortPos.entryPrice;
                const shortActivation = Number.isFinite(longPos.sl) && longPos.sl > 0 ? longPos.sl : longPos.entryPrice;

                longPos.tsCallback = sharedCallback;
                shortPos.tsCallback = sharedCallback;
                longPos.tsActivation = longActivation;
                shortPos.tsActivation = shortActivation;
                longPos.hedgeLinked = true;
                shortPos.hedgeLinked = true;

                if (!longPos.tsIsActive && currentPrice >= longActivation) {
                    longPos.tsIsActive = true;
                    longPos.tsExtremePrice = Math.max(longPos.tsExtremePrice || longPos.entryPrice, currentPrice);
                }
                if (!shortPos.tsIsActive && currentPrice <= shortActivation) {
                    shortPos.tsIsActive = true;
                    shortPos.tsExtremePrice = Math.min(shortPos.tsExtremePrice || shortPos.entryPrice, currentPrice);
                }
            });
        });
    },

    activateHedgeMate(closedPos, closePrice, closeReason) {
        if (!closedPos || !closedPos.autoHedgeTrail) return;
        const mates = this.state.positions.filter(p => p.id !== closedPos.id && p.pair === closedPos.pair && p.type !== closedPos.type && p.autoHedgeTrail);
        if (mates.length === 0) return;

        mates.forEach(mate => {
            mate.tsIsActive = true;
            mate.tsExtremePrice = closePrice;
            mate.tsActivation = closePrice;
            mate.tsCallback = Math.max(0.1, closedPos.tsCallback || mate.tsCallback || 1);
            mate.hedgeLinked = true;
        });

        if (typeof showToast === 'function') {
            showToast(`Hedge TS aktif setelah ${closeReason || 'close'} pada sisi lawan.`, false);
        }
    },

    processTrailingStop(pos, currentPrice) {
        if (!pos.tsCallback || pos.tsCallback <= 0) return false;

        const callbackDecimal = pos.tsCallback / 100;

        if (!pos.tsIsActive) {
            if (pos.type === 'LONG' && currentPrice >= (pos.tsActivation || pos.entryPrice)) {
                pos.tsIsActive = true;
                pos.tsExtremePrice = currentPrice;
            } else if (pos.type === 'SHORT' && currentPrice <= (pos.tsActivation || pos.entryPrice)) {
                pos.tsIsActive = true;
                pos.tsExtremePrice = currentPrice;
            }
            return false;
        }

        if (pos.type === 'LONG') {
            if (currentPrice > pos.tsExtremePrice) {
                pos.tsExtremePrice = currentPrice;
            }
            let triggerPrice = parseFloat((pos.tsExtremePrice * (1 - callbackDecimal)).toFixed(8));
            if (currentPrice <= triggerPrice) return true;
        } else {
            if (currentPrice < pos.tsExtremePrice) {
                pos.tsExtremePrice = currentPrice;
            }
            let triggerPrice = parseFloat((pos.tsExtremePrice * (1 + callbackDecimal)).toFixed(8));
            if (currentPrice >= triggerPrice) return true;
        }
        return false;
    },

    updateLivePNL(currentPrice) {
        if (!this.state.positions || this.state.positions.length === 0) { 
            setSafeText('demo-balance', `$${this.state.balance.toFixed(2)}`); 
            return; 
        }
        
        let totalEquity = this.state.balance;
        let toClose = [];

        this.state.positions.forEach((pos) => {
            if (pos.marginMode === 'ISOLATED') totalEquity += pos.margin; 
            
            let cPosPx = (pos.pair === AppState.g_pair) ? currentPrice : (AppState.lastPrices[pos.pair] || pos.entryPrice);
            let netPnlAll = pos.type === 'LONG' ? (cPosPx - pos.entryPrice) * pos.sizeBase : (pos.entryPrice - cPosPx) * pos.sizeBase;
            
            totalEquity += netPnlAll; 

            if (pos.pair !== AppState.g_pair) return; 

            let pnlPct = safeDiv(netPnlAll, pos.margin) * 100;

            const pnlEl = document.getElementById(`pos-pnl-${pos.id}`); 
            if (pnlEl) { 
                pnlEl.textContent = `$${netPnlAll.toFixed(2)} (${pnlPct.toFixed(2)}%)`; 
                pnlEl.className = netPnlAll >= 0 ? 'pnl-positive' : 'pnl-negative'; 
            }
            
            const currPxEl = document.getElementById(`pos-curr-${pos.id}`); 
            if (currPxEl) { 
                currPxEl.textContent = formatPrice(currentPrice); 
                currPxEl.style.color = netPnlAll >= 0 ? 'var(--color-correct)' : 'var(--color-wrong)'; 
            }

            if (this.posLines[pos.id]) {
                this.posLines[pos.id].applyOptions({ 
                    color: netPnlAll >= 0 ? 'rgba(74, 222, 128, 0.8)' : 'rgba(248, 113, 113, 0.8)', 
                    title: `${pos.type.charAt(0)}${pos.leverage}x | ${netPnlAll >= 0 ? '+' : ''}$${netPnlAll.toFixed(2)}` 
                });
            }

            if (pos.autoHedgeTrail) this.syncHedgeTrailingState(pos, currentPrice);

            if (this.processTrailingStop(pos, currentPrice)) {
                toClose.push({id: pos.id, isLiq: false, reason: "MANUAL TS TRIGGERED"});
                return;
            }

            let requiredMoveForBE = pos.atrSnapshot ? pos.atrSnapshot : (pos.entryPrice * 0.01);
            let is1to1 = pos.type === 'LONG' ? (currentPrice >= pos.entryPrice + requiredMoveForBE) : (currentPrice <= pos.entryPrice - requiredMoveForBE);
            
            if (pos.useBe && is1to1 && !pos.beLocked) { 
                let bePrice = pos.type === 'LONG' ? pos.entryPrice * (1 + (FEES.TAKER*2.5)) : pos.entryPrice * (1 - (FEES.TAKER*2.5));
                pos.sl = bePrice; 
                pos.beLocked = true; 
                showToast(`Break-Even Locked! SL dipindah ke Entry + Fees.`, false); 
                this.save(); 
            }
            
            if (pos.useTrailing && pnlPct > 20) { 
                if (pos.type === 'LONG') pos.maxFavorablePrice = Math.max(pos.maxFavorablePrice, currentPrice); 
                else pos.maxFavorablePrice = Math.min(pos.maxFavorablePrice, currentPrice);
                
                let trailDist = Math.max((AppState.live.atr * 1.5), (currentPrice * 0.003));
                let trailSL = pos.type === 'LONG' ? pos.maxFavorablePrice - trailDist : pos.maxFavorablePrice + trailDist;
                
                if ((pos.type === 'LONG' && currentPrice <= trailSL) || (pos.type === 'SHORT' && currentPrice >= trailSL)) { 
                    toClose.push({id: pos.id, isLiq: false, reason: "SMART ATR TS"}); 
                    return; 
                }
            }
            
            if (pos.tp && ((pos.type === 'LONG' && currentPrice >= pos.tp) || (pos.type === 'SHORT' && currentPrice <= pos.tp))) {
                toClose.push({id: pos.id, isLiq: false, reason: "TAKE PROFIT"});
            } else if (pos.sl && ((pos.type === 'LONG' && currentPrice <= pos.sl) || (pos.type === 'SHORT' && currentPrice >= pos.sl))) {
                toClose.push({id: pos.id, isLiq: false, reason: "STOP LOSS"});
            } else { 
                let liqPrice = this.calculateLiqPrice(pos, this.state.balance); 
                if ((pos.type === 'LONG' && currentPrice <= liqPrice) || (pos.type === 'SHORT' && currentPrice >= liqPrice)) {
                    toClose.push({id: pos.id, isLiq: true, reason: "LIQ"}); 
                }
            }
        });
        
        toClose.forEach(c => this.closePosition(c.id, c.isLiq, c.reason)); 
        
        setSafeText('demo-balance', `$${totalEquity.toFixed(2)}`);
        
        // Warning jika balance mendekati 0 dibanding total equity
        if(this.state.balance < totalEquity * 0.1 && totalEquity > 0) {
            document.getElementById('demo-balance').style.color = 'var(--color-wrong)';
        } else {
            document.getElementById('demo-balance').style.color = 'var(--accent-white)';
        }
    },

    drawChartLines() { 
        if (!series || !series.candle) return; 
        this.state.positions.forEach(pos => { 
            if (pos.pair === AppState.g_pair && !this.posLines[pos.id]) { 
                this.posLines[pos.id] = series.candle.createPriceLine({ 
                    price: pos.entryPrice, 
                    color: pos.type === 'LONG' ? '#4ade80' : '#f87171', 
                    lineWidth: 2, 
                    lineStyle: 0, 
                    axisLabelVisible: true, 
                    title: `${pos.type.charAt(0)}${pos.leverage}x` 
                }); 
            } 
        }); 
    },

    removeChartLine(id) { 
        if (this.posLines[id] && series && series.candle) { 
            try { series.candle.removePriceLine(this.posLines[id]); } catch(e) {} 
            delete this.posLines[id]; 
        } 
    },

    clearChartLines() { 
        for (let id in this.posLines) {
            this.removeChartLine(id);
        } 
        this.posLines = {}; 
    },

    updateUI() {
        const wrapper = document.getElementById('positions-wrapper');
        const activeInPair = this.state.positions.filter(p => p.pair === AppState.g_pair);
        
        if (activeInPair.length > 0) {
            wrapper.innerHTML = activeInPair.map(pos => {
                const cColor = pos.type === 'LONG' ? 'var(--color-correct)' : 'var(--color-wrong)'; 
                let liqPrice = this.calculateLiqPrice(pos, this.state.balance);
                let mModeStr = pos.marginMode === 'CROSS' ? 'Cross' : 'Isolated';
                
                let tpStr = '-';
                let slStr = '-';
                
                if (pos.tp) {
                    let roePct = (Math.abs(pos.tp - pos.entryPrice) / pos.entryPrice) * pos.leverage * 100;
                    tpStr = `${formatPrice(pos.tp)} <span style="color:var(--color-correct); font-size:9px;">(+${roePct.toFixed(2)}%)</span>`;
                }
                if (pos.sl) {
                    let roePct = (Math.abs(pos.sl - pos.entryPrice) / pos.entryPrice) * pos.leverage * 100;
                    slStr = `${formatPrice(pos.sl)} <span style="color:var(--color-wrong); font-size:9px;">(-${roePct.toFixed(2)}%)</span>`;
                }
                
                let badgesHtml = '';
                if (pos.tsIsActive) badgesHtml += '<span style="background:rgba(96, 165, 250, 0.2); color:var(--color-pending); padding:2px 4px; font-size:9px; border-radius:4px; font-weight:bold; margin-right:4px;">MANUAL TS</span>';
                if (pos.useBe) badgesHtml += '<span style="background:rgba(251, 191, 36, 0.2); color:var(--color-warning); padding:2px 4px; font-size:9px; border-radius:4px; font-weight:bold; margin-right:4px;">SL+</span>';
                if (pos.useTrailing) badgesHtml += '<span style="background:rgba(74, 222, 128, 0.2); color:var(--color-correct); padding:2px 4px; font-size:9px; border-radius:4px; font-weight:bold; margin-right:4px;">ATR TS</span>';
                if (pos.autoHedgeTrail) badgesHtml += '<span style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; padding:2px 4px; font-size:9px; border-radius:4px; font-weight:bold; margin-right:4px;">HEDGE TS</span>';
                if (pos.beLocked) badgesHtml += '<span style="background:rgba(248, 113, 113, 0.2); color:var(--color-wrong); padding:2px 4px; font-size:9px; border-radius:4px; font-weight:bold; margin-right:4px;">BE LOCKED</span>';
                if (pos.isAi) badgesHtml += '<span style="background:rgba(96, 165, 250, 0.2); color:var(--color-pending); padding:2px 4px; font-size:9px; border-radius:4px; font-weight:bold; margin-right:4px;">AI</span>';

                return `
                <div class="position-card">
                    <div class="position-card-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size: 14px; font-weight: 800; color: var(--accent-white);">${escapeHTML(pos.pair)}</span>
                            <span style="color: ${cColor}; font-weight: 700; font-size: 12px;">${escapeHTML(pos.type)}</span>
                            <span style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: var(--text-secondary);">${pos.leverage}x ${escapeHTML(mModeStr)}</span>
                        </div>
                        <div class="pos-close-icon" onclick="openPartialCloseModal(${pos.id})" title="Tutup Posisi (Atur Persentase)">✖</div>
                    </div>
                    <div style="margin-bottom: 8px; margin-top: -4px;">${badgesHtml}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px;">
                        <div><div style="color: var(--text-muted); margin-bottom: 2px;">Entry Price</div><div style="font-weight: 600; color: var(--accent-white);">${formatPrice(pos.entryPrice)}</div></div>
                        <div><div style="color: var(--text-muted); margin-bottom: 2px;">Current Price</div><div id="pos-curr-${pos.id}" style="font-weight: 600; color: var(--text-secondary);">-</div></div>
                        <div><div style="color: var(--text-muted); margin-bottom: 2px;">Margin / Size</div><div style="font-weight: 600; color: var(--text-secondary);">${pos.margin.toFixed(2)} / ${(pos.margin * pos.leverage).toFixed(2)}</div></div>
                        <div><div style="color: var(--text-muted); margin-bottom: 2px;">Liq. Price</div><div style="font-weight: 600; color: var(--color-wrong);">${formatPrice(liqPrice)}</div></div>
                        <div style="grid-column: span 2;">
                            <div style="color: var(--text-muted); margin-bottom: 4px; display:flex; justify-content:space-between; align-items:center;">
                                <span>Target Price & Stop Loss</span>
                                <span style="cursor:pointer; color:var(--text-primary); padding: 2px 8px; background: rgba(255,255,255,0.1); border-radius: 4px;" onclick="openEditTpSlModal(${pos.id})" title="Edit TP/SL">⋮ Edit</span>
                            </div>
                            <div style="font-weight: 600; color: var(--text-primary); background: var(--bg-input); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); display:flex; justify-content:space-between;">
                                <span>${tpStr}</span>
                                <span style="color:var(--text-muted);">/</span>
                                <span>${slStr}</span>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-main); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); margin-top: 4px;">
                        <span style="font-size: 11px; color: var(--text-secondary);">Unrealized PNL</span>
                        <span id="pos-pnl-${pos.id}" style="font-weight: 800; font-size: 14px; color: var(--accent-white);">$0.00 (0.00%)</span>
                    </div>
                </div>`;
            }).join('');
        } else { 
            wrapper.innerHTML = ''; 
        }
        if (typeof triggerGlobalAlertIfNeeded === 'function') triggerGlobalAlertIfNeeded();
    }
};

window.executeFuturesTrade = function(type, isAi) {
    if (type === 'AI') {
        let sig = AppState.live.signal;
        if (sig === 'STRONG BUY') type = 'LONG'; 
        else if (sig === 'STRONG SELL') type = 'SHORT';
        else { 
            if (AppState.aiMode === 'AGG') { 
                type = AppState.live.score >= 0 ? 'LONG' : 'SHORT'; 
                showToast("AI (AGG): Eksekusi Paksa Scalping!", false); 
            } else { 
                showToast("AI (CONS): Sinyal tidak cukup kuat. Tunggu konfirmasi.", true); 
                return; 
            } 
        }
    }
    FuturesEngine.openPosition(type, isAi);
};
