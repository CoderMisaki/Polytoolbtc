function calculatePnl(position, currentPrice) {
  const entryPrice = Number(position?.entryPrice);
  const price = Number(currentPrice);
  const sizeBase = Number(position?.sizeBase ?? position?.size ?? 0);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(price) || !Number.isFinite(sizeBase)) return 0;
  if (position?.type === 'LONG') return (price - entryPrice) * sizeBase;
  if (position?.type === 'SHORT') return (entryPrice - price) * sizeBase;
  return 0;
}

if (typeof window !== 'undefined') window.calculatePnl = calculatePnl;
if (typeof module !== 'undefined' && module.exports) module.exports = { calculatePnl };
