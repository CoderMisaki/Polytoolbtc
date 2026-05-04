function calcSMA(data, period, key) { 
    let res = [];
    let sum = 0; 
    for (let i = 0; i < data.length; i++) { 
        sum += key ? data[i][key] : data[i]; 
        if (i >= period) {
            sum -= key ? data[i-period][key] : data[i-period]; 
        }
        res.push(i >= period - 1 ? sum / period : sum / (i + 1)); 
    } 
    return res; 
}

function calcEMA(data, period, key = 'close') { 
    if (!data || data.length === 0) return []; 
    let res = [];
    let k = 2 / (period + 1);
    let ema = data[0][key]; 
    for (let i = 0; i < data.length; i++) { 
        ema = (data[i][key] - ema) * k + ema; 
        res.push({ time: data[i].time, value: ema }); 
    } 
    return res; 
}

function calcMACD(data, fast=12, slow=26, sig=9) { 
    if (!data || data.length < slow) return []; 
    let emaF = calcEMA(data, fast, 'close');
    let emaS = calcEMA(data, slow, 'close');
    let macdLine = []; 
    for (let i = 0; i < data.length; i++) {
        macdLine.push({ time: data[i].time, value: i < slow - 1 ? 0 : emaF[i].value - emaS[i].value }); 
    }
    let sigLine = calcEMA(macdLine, sig, 'value');
    let hist = []; 
    for (let i = 0; i < data.length; i++) {
        hist.push({ time: data[i].time, value: macdLine[i].value - sigLine[i].value, macd: macdLine[i].value, signal: sigLine[i].value }); 
    }
    return hist; 
}

function calcADX(data, period) {
    if (!data || data.length <= period) return []; 
    let res = [];
    let tr = [];
    let pDM = [];
    let mDM = [];
    
    for (let i = 1; i < data.length; i++) { 
        let h = data[i].high;
        let l = data[i].low;
        let pC = data[i-1].close;
        let pH = data[i-1].high;
        let pL = data[i-1].low; 
        
        tr.push(Math.max(h - l, Math.abs(h - pC), Math.abs(l - pC))); 
        let mU = h - pH;
        let mD = pL - l; 
        
        pDM.push(mU > 0 && mU > mD ? mU : 0); 
        mDM.push(mD > 0 && mD > mU ? mD : 0); 
    }
    
    function smooth(arr, len) { 
        let s = [];
        let sum = 0; 
        for(let i=0; i<len; i++) {
            sum += arr[i]; 
        }
        s.push(sum); 
        for(let i=len; i<arr.length; i++) {
            s.push(s[s.length-1] - (s[s.length-1]/len) + arr[i]); 
        }
        return s; 
    }
    
    if(tr.length < period) return data.map(d=>({time:d.time, value: 0})); 
    
    let sTR = smooth(tr, period);
    let spDM = smooth(pDM, period);
    let smDM = smooth(mDM, period);
    let dx = [];
    
    for (let i = 0; i < sTR.length; i++) { 
        let dP = sTR[i] > 0 ? (spDM[i] / sTR[i]) * 100 : 0;
        let dM = sTR[i] > 0 ? (smDM[i] / sTR[i]) * 100 : 0;
        let sumDI = dP + dM; 
        dx.push(sumDI === 0 ? 0 : (Math.abs(dP - dM) / sumDI) * 100); 
    }
    
    let adxS = smooth(dx, period);
    let p = 0; 
    for(let i=0; i<data.length; i++) {
        res.push({time: data[i].time, value: i < 2 * period ? 0 : adxS[p++] || 0}); 
    }
    return res;
}

function calcVWAP(data) { 
    let res = [];
    let sumPV = 0;
    let sumV = 0; 
    for (let i = 0; i < data.length; i++) { 
        if (i > 0 && new Date(data[i-1].time * 1000).getUTCDay() !== new Date(data[i].time * 1000).getUTCDay()) { 
            sumPV = 0; 
            sumV = 0; 
        } 
        let tP = (data[i].high + data[i].low + data[i].close) / 3; 
        sumPV += tP * data[i].vol; 
        sumV += data[i].vol; 
        res.push({ time: data[i].time, value: sumV === 0 ? data[i].close : safeDiv(sumPV, sumV) }); 
    } 
    return res; 
}

function calcST(data, period = 21, factor = 1.618) {
    if (!data || data.length === 0) {
        return { up: [], down: [], raw: [] };
    }
    
    let up = [];
    let down = [];
    let raw = [];
    let longStop = 0;
    let shortStop = 0;
    let trend = 1;
    let atrArr = [];

    for (let i = 0; i < data.length; i++) {
        let tr = i === 0 ? data[i].high - data[i].low : 
                 Math.max(data[i].high - data[i].low, 
                 Math.abs(data[i].high - data[i-1].close), 
                 Math.abs(data[i].low - data[i-1].close));
        atrArr.push(tr);
    }

    let smoothAtr = 0;
    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            smoothAtr = atrArr.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
        } else {
            smoothAtr = (smoothAtr * (period - 1) + atrArr[i]) / period;
        }

        let mid = (data[i].high + data[i].low) / 2;
        let upperBand = mid + (factor * smoothAtr);
        let lowerBand = mid - (factor * smoothAtr);

        if (i > 0) {
            longStop = data[i-1].close > longStop ? Math.max(lowerBand, longStop) : lowerBand;
            shortStop = data[i-1].close < shortStop ? Math.min(upperBand, shortStop) : upperBand;

            let prevTrend = trend;
            if (data[i].close > shortStop) {
                trend = 1;
            } else if (data[i].close < longStop) {
                trend = -1;
            }

            let currentST = trend === 1 ? longStop : shortStop;
            raw.push({ time: data[i].time, value: currentST, trend: trend });

            if (trend === 1) {
                up.push({ time: data[i].time, value: currentST });
                down.push({ time: data[i].time }); 
            } else {
                down.push({ time: data[i].time, value: currentST });
                up.push({ time: data[i].time }); 
            }
        } else {
            longStop = lowerBand; 
            shortStop = upperBand;
            raw.push({ time: data[i].time, value: lowerBand, trend: 1 });
            up.push({ time: data[i].time, value: lowerBand });
            down.push({ time: data[i].time });
        }
    }
    return { up, down, raw };
}

function calcRSI(data, period) { 
    if (!data || data.length === 0) return []; 
    let res = [];
    let gain = 0;
    let loss = 0;
    let limit = Math.min(period, data.length); 
    
    for (let i = 0; i < limit; i++) {
        res.push({time: data[i].time, value: 50});
    }
    if (data.length <= period) return res; 
    
    for (let i = 1; i <= period; i++) { 
        let change = data[i].close - data[i-1].close; 
        if (change > 0) gain += change; else loss -= change; 
    } 
    
    let avgGain = safeDiv(gain, period);
    let avgLoss = safeDiv(loss, period); 
    
    for (let i = period; i < data.length; i++) { 
        if (i > period) { 
            let change = data[i].close - data[i-1].close; 
            avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period; 
            avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period; 
        } 
        let rs = avgLoss === 0 ? 100 : safeDiv(avgGain, avgLoss); 
        res.push({ time: data[i].time, value: avgLoss === 0 ? 100 : 100 - (100 / (1 + rs)) }); 
    } 
    return res; 
}

function calcStochRSI(rsiData, period, smoothK, smoothD) { 
    if (rsiData.length === 0) return { k: [], d: [] }; 
    let stoch = []; 
    for (let i = 0; i < rsiData.length; i++) { 
        if (i < period - 1) { 
            stoch.push({ time: rsiData[i].time, value: 50 }); 
            continue; 
        } 
        let slice = rsiData.slice(i - period + 1, i + 1).map(r => r.value);
        let max = Math.max(...slice);
        let min = Math.min(...slice); 
        stoch.push({ time: rsiData[i].time, value: max === min ? 50 : ((rsiData[i].value - min) / (max - min)) * 100 }); 
    } 
    let kA = calcSMA(stoch, smoothK, 'value');
    let k = kA.map((v, i) => ({ time: stoch[i].time, value: v }));
    let dA = calcSMA(k, smoothD, 'value');
    let d = dA.map((v, i) => ({ time: k[i].time, value: v })); 
    return { k, d }; 
}

function calcWR(data, period) { 
    let res = []; 
    for (let i = 0; i < data.length; i++) { 
        if (i < period - 1) { 
            res.push({ time: data[i].time, value: -50 }); 
            continue; 
        } 
        let slice = data.slice(i - period + 1, i + 1);
        let maxH = Math.max(...slice.map(c => c.high));
        let minL = Math.min(...slice.map(c => c.low)); 
        res.push({ time: data[i].time, value: maxH === minL ? -50 : ((maxH - data[i].close) / (maxH - minL)) * -100 }); 
    } 
    return res; 
}

function calcBB(data, period=21, mult=1.618) { 
    let res = []; 
    for(let i=0; i<data.length; i++){ 
        if(i<period-1) { 
            res.push({time: data[i].time, upper: data[i].close, lower: data[i].close, middle: data[i].close}); 
            continue; 
        } 
        let slice = data.slice(i - period + 1, i + 1);
        let mean = slice.reduce((a,b)=>a+b.close, 0)/period;
        let variance = slice.reduce((a,b)=>a+Math.pow(b.close-mean, 2), 0)/period;
        let std = Math.sqrt(variance); 
        res.push({time: data[i].time, upper: mean + mult*std, lower: mean - mult*std, middle: mean}); 
    } 
    return res; 
}

function calcDonchian(data, period=21) { 
    let res = []; 
    for(let i=0; i<data.length; i++){ 
        if(i<period-1) { 
            res.push({time: data[i].time, upper: data[i].high, lower: data[i].low, middle: (data[i].high+data[i].low)/2}); 
            continue; 
        } 
        let slice = data.slice(i - period + 1, i + 1);
        let maxH = Math.max(...slice.map(c=>c.high));
        let minL = Math.min(...slice.map(c=>c.low)); 
        res.push({time: data[i].time, upper: maxH, lower: minL, middle: (maxH+minL)/2}); 
    } 
    return res; 
}

function calcOBV_CVD(data) { 
    let obv = [];
    let cvd = [];
    let obvSum = 0;
    let cvdSum = 0; 
    for(let i=0; i<data.length; i++){ 
        if(i>0) { 
            if(data[i].close > data[i-1].close) {
                obvSum += data[i].vol; 
            } else if(data[i].close < data[i-1].close) {
                obvSum -= data[i].vol; 
            }
        } 
        let buyVol = data[i].takerVol || (data[i].vol * 0.5);
        let sellVol = data[i].vol - buyVol; 
        cvdSum += (buyVol - sellVol); 
        obv.push({time: data[i].time, value: obvSum}); 
        cvd.push({time: data[i].time, value: cvdSum}); 
    } 
    return { obv, cvd }; 
}

function calcPSAR(data, step = 0.02, max = 0.2) { 
    let res = []; 
    if(data.length === 0) return res; 
    let isUp = true;
    let ep = data[0].high;
    let sar = data[0].low;
    let af = step; 
    
    for(let i=0; i<data.length; i++) { 
        if(i===0){ 
            res.push({time: data[i].time, value: sar}); 
            continue; 
        } 
        let pS = sar; 
        sar = pS + af * (ep - pS); 
        
        if(isUp) { 
            if(data[i].low < sar) { 
                isUp = false; 
                sar = ep; 
                ep = data[i].low; 
                af = step; 
            } else { 
                if(data[i].high > ep) { 
                    ep = data[i].high; 
                    af = Math.min(af + step, max); 
                } 
                sar = Math.min(sar, data[i-1].low, i>1 ? data[i-2].low : data[i-1].low); 
            } 
        } else { 
            if(data[i].high > sar) { 
                isUp = true; 
                sar = ep; 
                ep = data[i].high; 
                af = step; 
            } else { 
                if(data[i].low < ep) { 
                    ep = data[i].low; 
                    af = Math.min(af + step, max); 
                } 
                sar = Math.max(sar, data[i-1].high, i>1 ? data[i-2].high : data[i-1].high); 
            } 
        } 
        res.push({time: data[i].time, value: sar, trend: isUp ? 1 : -1}); 
    } 
    return res; 
}

function calcMFI(data, period=21) { 
    let res = []; 
    for(let i=0; i<data.length; i++){ 
        if(i < period) { 
            res.push({time: data[i].time, value: 50}); 
            continue; 
        } 
        let posMF = 0;
        let negMF = 0; 
        for(let j = i - period + 1; j <= i; j++){ 
            let typ = (data[j].high + data[j].low + data[j].close)/3;
            let pTyp = (data[j-1].high + data[j-1].low + data[j-1].close)/3;
            let mf = typ * data[j].vol; 
            
            if(typ > pTyp) {
                posMF += mf; 
            } else if(typ < pTyp) {
                negMF += mf; 
            }
        } 
        let ratio = negMF === 0 ? 100 : posMF / negMF; 
        res.push({time: data[i].time, value: 100 - (100 / (1 + ratio))}); 
    } 
    return res; 
}

function calcLinReg(data, period=21) { 
    let res = []; 
    for(let i=0; i<data.length; i++){ 
        if(i<period-1) { 
            res.push({time: data[i].time, value: data[i].close, slope:0}); 
            continue; 
        } 
        let sX = 0;
        let sY = 0;
        let sXY = 0;
        let sXX = 0; 
        for(let j=0; j<period; j++) { 
            let x = j;
            let y = data[i - period + 1 + j].close; 
            sX += x; 
            sY += y; 
            sXY += x*y; 
            sXX += x*x; 
        } 
        let slope = (period * sXY - sX * sY) / (period * sXX - sX * sX);
        let intercept = (sY - slope * sX) / period; 
        res.push({time: data[i].time, value: intercept + slope * (period - 1), slope: slope}); 
    } 
    return res; 
}

function calcVolOsc(data, fast=8, slow=21) { 
    let res = [];
    let fSMA = calcSMA(data, fast, 'vol');
    let sSMA = calcSMA(data, slow, 'vol'); 
    for(let i=0; i<data.length; i++) {
        res.push({time: data[i].time, value: sSMA[i] === 0 ? 0 : ((fSMA[i] - sSMA[i])/sSMA[i])*100}); 
    }
    return res; 
}

function calcIchimoku(data, tenkan=8, kijun=21, senkou=55) { 
    let res = [];
    let getHL2 = (slice) => { 
        if(!slice.length) return 0; 
        return (Math.max(...slice.map(c=>c.high)) + Math.min(...slice.map(c=>c.low)))/2; 
    }; 
    for(let i=0; i<data.length; i++){ 
        let tVal = getHL2(data.slice(Math.max(0, i-tenkan+1), i+1));
        let kVal = getHL2(data.slice(Math.max(0, i-kijun+1), i+1));
        let spanB = getHL2(data.slice(Math.max(0, i-senkou+1), i+1)); 
        res.push({time: data[i].time, tenkan: tVal, kijun: kVal, spanA: (tVal + kVal)/2, spanB: spanB}); 
    } 
    return res; 
}

function calcPivots(data) { 
    let res = [];
    let period = AppState.g_tf === '1m' ? 1440 : (AppState.g_tf === '5m' ? 288 : (AppState.g_tf === '1h' ? 24 : 96)); 
    for(let i=0; i<data.length; i++){ 
        if(i < period) { 
            res.push({time: data[i].time, p: data[i].close, r1: data[i].close, s1: data[i].close}); 
            continue; 
        } 
        let slice = data.slice(i-period, i);
        let p = (Math.max(...slice.map(c=>c.high)) + Math.min(...slice.map(c=>c.low)) + slice[slice.length-1].close) / 3; 
        res.push({time: data[i].time, p, r1: (2 * p) - Math.min(...slice.map(c=>c.low)), s1: (2 * p) - Math.max(...slice.map(c=>c.high))}); 
    } 
    return res; 
}

// Bugfix v4.4: Solusi string grouping untuk Koin Micin
function calcPOC(data, lookback=100) { 
    let res = []; 
    for(let i=0; i<data.length; i++){ 
        if(i<lookback) { 
            res.push({time: data[i].time, value: data[i].close}); 
            continue; 
        } 
        let slice = data.slice(i-lookback, i);
        let bins = {};
        let maxVol = 0;
        let poc = data[i].close;
        
        // Menghindari tabrakan float micin
        let step = data[i].close * 0.001; 
        if (step === 0) step = 0.00000001;

        slice.forEach(c => { 
            let binKey = (Math.round(c.close / step) * step).toFixed(8); 
            bins[binKey] = (bins[binKey] || 0) + c.vol; 
            if(bins[binKey] > maxVol) { 
                maxVol = bins[binKey]; 
                poc = parseFloat(binKey); 
            } 
        }); 
        res.push({time: data[i].time, value: poc}); 
    } 
    return res; 
}

function calculateAllIndicators() {
    const data = AppState.candles; 
    if (data.length === 0) return;
    
    AppState.indicators.e21 = calcEMA(data, 21, 'close'); 
    AppState.indicators.e55 = calcEMA(data, 55, 'close'); 
    AppState.indicators.e200 = calcEMA(data, 200, 'close');
    
    const st = calcST(data, 21, 1.618); 
    AppState.indicators.st = st.raw; 
    AppState.indicators.stUp = st.up; 
    AppState.indicators.stDown = st.down;

    AppState.indicators.rsi = calcRSI(data, 14); 
    AppState.indicators.rsi21 = calcRSI(data, 21); 
    AppState.indicators.adx = calcADX(data, 14); 
    AppState.indicators.macd = calcMACD(data, 12, 26, 9);
    
    let stoch = calcStochRSI(AppState.indicators.rsi, 14, 3, 3); 
    AppState.indicators.stochK = stoch.k; 
    AppState.indicators.stochD = stoch.d; 
    AppState.indicators.wr = calcWR(data, 14); 
    AppState.indicators.vwap = calcVWAP(data);
    
    AppState.indicators.bb = calcBB(data, 21, 1.618); 
    AppState.indicators.donchian = calcDonchian(data, 21);
    
    let obvcvd = calcOBV_CVD(data); 
    AppState.indicators.obv = obvcvd.obv; 
    AppState.indicators.cvd = obvcvd.cvd;
    
    AppState.indicators.psar = calcPSAR(data, 0.02, 0.2); 
    AppState.indicators.mfi = calcMFI(data, 21); 
    AppState.indicators.linreg = calcLinReg(data, 21);
    AppState.indicators.volosc = calcVolOsc(data, 8, 21); 
    AppState.indicators.ichimoku = calcIchimoku(data, 8, 21, 55); 
    AppState.indicators.pivots = calcPivots(data); 
    AppState.indicators.poc = calcPOC(data, 100);

    let vSma = [];
    let atrArr = [];
    let sumVol = 0; 
    AppState.swings.highs = []; 
    AppState.swings.lows = [];
    
    for (let i = 0; i < data.length; i++) {
        sumVol += data[i].vol; 
        if (i >= 20) {
            sumVol -= data[i-20].vol; 
        }
        vSma.push(i >= 19 ? sumVol/20 : sumVol/(i+1));
        
        let atr = i === 0 ? data[i].high - data[i].low : 
                  Math.max(data[i].high - data[i].low, 
                  Math.abs(data[i].high - data[i-1].close), 
                  Math.abs(data[i].low - data[i-1].close)); 
        atrArr.push(atr);
        
        if (i > 4 && i < data.length - 4) {
            let isPH = true;
            let isPL = true; 
            for (let j = 1; j <= 4; j++) { 
                if (data[i].high <= data[i-j].high || data[i].high <= data[i+j].high) isPH = false; 
                if (data[i].low >= data[i-j].low || data[i].low >= data[i+j].low) isPL = false; 
            }
            if (isPH) {
                AppState.swings.highs.push({time: data[i].time, val: data[i].high}); 
            }
            if (isPL) {
                AppState.swings.lows.push({time: data[i].time, val: data[i].low});
            }
        }
    }
    AppState.volSMA = vSma; 
    let atrSum = 0; 
    AppState.atrSMA = [];
    
    for (let i = 0; i < atrArr.length; i++) { 
        atrSum += atrArr[i]; 
        if (i >= 14) {
            atrSum -= atrArr[i-14]; 
        }
        AppState.atrSMA.push(i >= 13 ? atrSum/14 : atrSum/(i+1)); 
    }
}