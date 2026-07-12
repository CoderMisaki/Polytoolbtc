const { getActiveUsers, getActivePositionsByUser, saveActivePositionsByUser, getUserState, saveUserState, removeUserFromIndex } = require('./_redis');
const { getTickerPrice, normalizeTickerPair, isMarketDataStale, STALE_PRICE_THRESHOLD_MS } = require('./cron-check');

const FEES = {
    TAKER: 0.0005,
    MAKER: 0.0002,
    SLIPPAGE: 0.0002
};

function processTrailingStop(pos, currentPrice) {
    if (!pos.tsCallback || pos.tsCallback <= 0) return false;
    let activated = false;

    if (pos.type === 'LONG') {
        if (currentPrice >= pos.tsActivation) activated = true;
        if (pos.tsActive || activated) {
            pos.tsActive = true;
            pos.maxFavorablePrice = Math.max(pos.maxFavorablePrice || currentPrice, currentPrice);
            let dropDist = pos.maxFavorablePrice * (pos.tsCallback / 100);
            pos.sl = pos.maxFavorablePrice - dropDist;
        }
    } else {
        if (currentPrice <= pos.tsActivation) activated = true;
        if (pos.tsActive || activated) {
            pos.tsActive = true;
            pos.maxFavorablePrice = Math.min(pos.maxFavorablePrice || currentPrice, currentPrice);
            let dropDist = pos.maxFavorablePrice * (pos.tsCallback / 100);
            pos.sl = pos.maxFavorablePrice + dropDist;
        }
    }

    if (pos.tsActive) {
        if (pos.type === 'LONG' && currentPrice <= pos.sl) return true;
        if (pos.type === 'SHORT' && currentPrice >= pos.sl) return true;
    }
    return false;
}

function processPosition(pos, currentPrice) {
    // Returns { closeReason: string | null, isLiquidated: boolean, netPnlAbs: number, closedPos: object | null }
    let closeReason = null;
    let isLiquidated = false;
    let netPnlAbs = 0;

    let balance = pos._simBalance; // Injected per user

    const sizeBase = pos.sizeBase || (pos.margin * pos.leverage / pos.entryPrice);
    let pnlRaw = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * sizeBase : (pos.entryPrice - currentPrice) * sizeBase;
    let marginToUse = pos.marginMode === 'CROSS' ? balance + pos.margin : pos.margin;
    let pnlPct = (pnlRaw / marginToUse) * 100;

    let maintMargin = sizeBase * currentPrice * 0.005; // MM_RATE
    let eq = marginToUse + pnlRaw;

    // Check Liquidation
    if (eq <= maintMargin) {
        isLiquidated = true;
        closeReason = 'LIQUIDATION';
    } else {
        // Check BE / TS / SL / TP
        let requiredMoveForBE = pos.atrSnapshot || (pos.entryPrice * 0.01);
        let is1to1 = pos.type === 'LONG' ? (currentPrice >= pos.entryPrice + requiredMoveForBE) : (currentPrice <= pos.entryPrice - requiredMoveForBE);

        if (pos.useBe && is1to1 && !pos.beLocked) {
            let bePrice = pos.type === 'LONG' ? pos.entryPrice * (1 + (FEES.TAKER*2.5)) : pos.entryPrice * (1 - (FEES.TAKER*2.5));
            pos.sl = bePrice;
            pos.beLocked = true;
        }

        if (processTrailingStop(pos, currentPrice)) {
            closeReason = "MANUAL TS TRIGGERED";
        } else if (pos.sl && ((pos.type === 'LONG' && currentPrice <= pos.sl) || (pos.type === 'SHORT' && currentPrice >= pos.sl))) {
            closeReason = "STOP LOSS";
        } else if (pos.tp && ((pos.type === 'LONG' && currentPrice >= pos.tp) || (pos.type === 'SHORT' && currentPrice <= pos.tp))) {
            closeReason = "TAKE PROFIT";
        }
    }

    if (closeReason) {
        let exitPrice = currentPrice;
        let pnlAtClose = pos.type === 'LONG' ? (exitPrice - pos.entryPrice) * sizeBase : (pos.entryPrice - exitPrice) * sizeBase;
        let execFee = sizeBase * exitPrice * FEES.TAKER;
        netPnlAbs = pnlAtClose - execFee;

        let closedPos = { ...pos, closePrice: exitPrice, pnl: netPnlAbs, closeReason, closeTime: Date.now(), isLiquidated };
        return { closeReason, isLiquidated, netPnlAbs, closedPos };
    }

    return { closeReason: null };
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST, OPTIONS');
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization || '';
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const executionLogs = [];
    try {
        const activeUsers = await getActiveUsers();
        if (!activeUsers || activeUsers.length === 0) {
            return res.status(200).json({ success: true, message: 'Tidak ada user aktif.', logs: [] });
        }

        let allPairs = new Set();
        let userPositionsMap = {};

        for (const userId of activeUsers) {
            const positions = await getActivePositionsByUser(userId);
            if (positions && positions.length > 0) {
                userPositionsMap[userId] = positions;
                positions.forEach(p => {
                    try { allPairs.add(normalizeTickerPair(p.pair)); } catch (e) {}
                });
            } else {
                await removeUserFromIndex(userId);
            }
        }

        // Fetch prices once
        const prices = {};
        const failedPairs = new Set();
        for (const pair of Array.from(allPairs)) {
            try {
                prices[pair] = await getTickerPrice(pair);
            } catch (error) {
                failedPairs.add(pair);
                executionLogs.push(`Skipped ${pair}: fetch harga gagal (${error.message})`);
            }
        }

        // Process users
        let totalClosed = 0;
        for (const [userId, positions] of Object.entries(userPositionsMap)) {
            const userState = await getUserState(userId);
            let remainingPositions = [];
            let stateChanged = false;

            for (const pos of positions) {
                const pair = pos.pair;
                const currentPrice = prices[pair];

                if (failedPairs.has(pair) || !Number.isFinite(currentPrice)) {
                    if (isMarketDataStale(pos)) {
                        executionLogs.push(`Closed ${pos.id} ${pair} stale price`);
                        let fallbackPrice = Number(pos.lastKnownPrice) || Number(pos.entryPrice);
                        pos._simBalance = userState.balance;
                        const result = processPosition(pos, fallbackPrice);
                        // Force close if stale
                        if (!result.closeReason) {
                            result.closeReason = 'MARKET_DATA_STALE';
                            result.closedPos = { ...pos, closePrice: fallbackPrice, pnl: 0, closeReason: 'MARKET_DATA_STALE', closeTime: Date.now(), isLiquidated: false };
                        }
                        userState.history.push(result.closedPos);
                        if (userState.history.length > 200) userState.history = userState.history.slice(-200);

                        // Handle Balance
                        if (result.isLiquidated) {
                            if (pos.marginMode === 'CROSS') {
                                userState.balance = 0;
                            } else {
                                userState.balance += 0; // margin lost
                            }
                        } else {
                            let returnedMargin = pos.marginMode === 'ISOLATED' ? pos.margin + (result.netPnlAbs || 0) : (result.netPnlAbs || 0);
                            userState.balance += returnedMargin;
                        }

                        totalClosed++;
                        stateChanged = true;
                    } else {
                        remainingPositions.push(pos);
                    }
                    continue;
                }

                pos.lastSuccessfulPriceCheck = Date.now();
                pos.lastKnownPrice = currentPrice;
                pos._simBalance = userState.balance;

                const result = processPosition(pos, currentPrice);

                if (result.closeReason) {
                    userState.history.push(result.closedPos);
                    if (userState.history.length > 200) userState.history = userState.history.slice(-200);

                    if (result.isLiquidated) {
                        if (pos.marginMode === 'CROSS') {
                            userState.balance = 0;
                        }
                    } else {
                        let returnedMargin = pos.marginMode === 'ISOLATED' ? pos.margin + result.netPnlAbs : result.netPnlAbs;
                        userState.balance += returnedMargin;
                    }

                    executionLogs.push(`Closed ${pos.id} ${pair} ${pos.type} via ${result.closeReason} at ${currentPrice} PnL: ${result.netPnlAbs}`);
                    totalClosed++;
                    stateChanged = true;
                } else {
                    remainingPositions.push(pos);
                }
            }

            if (remainingPositions.length !== positions.length) {
                await saveActivePositionsByUser(userId, remainingPositions);
                if (remainingPositions.length === 0) {
                    await removeUserFromIndex(userId);
                }
            } else if (positions.length > 0) {
                // Save updated TS/BE state and lastKnownPrice
                await saveActivePositionsByUser(userId, remainingPositions);
            }

            if (stateChanged) {
                await saveUserState(userId, userState);
            }
        }

        return res.status(200).json({ success: true, processedUsers: Object.keys(userPositionsMap).length, closed: totalClosed, logs: executionLogs });
    } catch (error) {
        console.error('System Cron Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', logs: executionLogs });
    }
};
