const { ALLOWED_PAIR_SET: ALLOWED_PAIRS } = require('../shared/pairs');
const ALLOWED_TYPES = new Set(['LONG', 'SHORT']);
const ALLOWED_MARGIN_MODES = new Set(['CROSS', 'ISOLATED']);
const MAX_ACTIVE_POSITIONS_PER_USER = 50;
const MAX_DEMO_AMOUNT = 1_000_000;
const MAX_CREATED_AT_FUTURE_MS = 5 * 60 * 1000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/;

function toFinitePositiveNumber(value, field) {
  if (typeof value === 'boolean' || value === null || value === '') {
    return { error: `${field} wajib berupa angka lebih dari 0.` };
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return { error: `${field} wajib berupa angka lebih dari 0.` };
  }
  return { value: numberValue };
}

function validateTimestamp(value, field) {
  if (value === undefined) return { value };
  const timestamp = Number(value);
  const now = Date.now();
  const earliestReasonable = Date.UTC(2020, 0, 1);
  const latestReasonable = now + MAX_CREATED_AT_FUTURE_MS;
  if (!Number.isFinite(timestamp) || timestamp < earliestReasonable || timestamp > latestReasonable) {
    return { error: `${field} harus timestamp valid dan tidak terlalu jauh di masa depan.` };
  }
  return { value: timestamp };
}

function validatePositionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Body posisi tidak valid.' };
  }

  if (typeof payload.id !== 'string' || !SAFE_ID_PATTERN.test(payload.id)) {
    return { valid: false, error: 'id posisi wajib string aman dengan panjang wajar.' };
  }

  const pair = String(payload.pair || '').toUpperCase();
  if (!ALLOWED_PAIRS.has(pair)) {
    return { valid: false, error: 'pair tidak didukung untuk mode demo.' };
  }

  const type = String(payload.type || '').toUpperCase();
  if (!ALLOWED_TYPES.has(type)) {
    return { valid: false, error: 'type posisi wajib LONG atau SHORT.' };
  }

  const entry = toFinitePositiveNumber(payload.entryPrice, 'entryPrice');
  if (entry.error) return { valid: false, error: entry.error };
  const sl = toFinitePositiveNumber(payload.sl, 'sl');
  if (sl.error) return { valid: false, error: sl.error };
  const tp = toFinitePositiveNumber(payload.tp, 'tp');
  if (tp.error) return { valid: false, error: tp.error };

  const leverage = Number(payload.leverage);
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > 125) {
    return { valid: false, error: 'leverage wajib integer antara 1 dan 125.' };
  }

  const amountSource = payload.amount ?? payload.margin;
  const amount = toFinitePositiveNumber(amountSource, payload.amount === undefined ? 'margin' : 'amount');
  if (amount.error) return { valid: false, error: amount.error };
  if (amount.value > MAX_DEMO_AMOUNT) {
    return { valid: false, error: `amount/margin mode demo maksimal ${MAX_DEMO_AMOUNT}.` };
  }

  let marginMode;
  if (payload.marginMode !== undefined) {
    marginMode = String(payload.marginMode).toUpperCase();
    if (!ALLOWED_MARGIN_MODES.has(marginMode)) {
      return { valid: false, error: 'marginMode wajib CROSS atau ISOLATED.' };
    }
  }

  const createdAtValidation = validateTimestamp(payload.createdAt, 'createdAt');
  if (createdAtValidation.error) return { valid: false, error: createdAtValidation.error };
  const openTimeValidation = validateTimestamp(payload.openTime, 'openTime');
  if (openTimeValidation.error) return { valid: false, error: openTimeValidation.error };
  const createdAt = createdAtValidation.value ?? openTimeValidation.value;
  const openTime = openTimeValidation.value ?? createdAtValidation.value;

  if (type === 'LONG') {
    if (!(sl.value < entry.value)) return { valid: false, error: 'Untuk LONG, SL harus lebih kecil dari entryPrice.' };
    if (!(tp.value > entry.value)) return { valid: false, error: 'Untuk LONG, TP harus lebih besar dari entryPrice.' };
  }

  if (type === 'SHORT') {
    if (!(sl.value > entry.value)) return { valid: false, error: 'Untuk SHORT, SL harus lebih besar dari entryPrice.' };
    if (!(tp.value < entry.value)) return { valid: false, error: 'Untuk SHORT, TP harus lebih kecil dari entryPrice.' };
  }

  return {
    valid: true,
    value: {
      ...payload,
      id: payload.id,
      pair,
      type,
      entryPrice: entry.value,
      sl: sl.value,
      tp: tp.value,
      leverage,
      amount: payload.amount !== undefined ? amount.value : payload.amount,
      margin: payload.margin !== undefined ? amount.value : payload.margin,
      marginMode: marginMode || payload.marginMode,
      createdAt: createdAt ?? payload.createdAt,
      openTime: openTime ?? payload.openTime
    }
  };
}


function validatePositionPatchPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Body posisi tidak valid.' };
  }
  if (typeof payload.id !== 'string' || !SAFE_ID_PATTERN.test(payload.id)) {
    return { valid: false, error: 'id posisi wajib string aman dengan panjang wajar.' };
  }

  const value = { id: payload.id };
  for (const field of ['tp', 'sl', 'entryPrice', 'margin', 'amount']) {
    if (payload[field] !== undefined) {
      const parsed = toFinitePositiveNumber(payload[field], field);
      if (parsed.error) return { valid: false, error: parsed.error };
      if ((field === 'margin' || field === 'amount') && parsed.value > MAX_DEMO_AMOUNT) {
        return { valid: false, error: `amount/margin mode demo maksimal ${MAX_DEMO_AMOUNT}.` };
      }
      value[field] = parsed.value;
    }
  }
  if (payload.leverage !== undefined) {
    const leverage = Number(payload.leverage);
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > 125) {
      return { valid: false, error: 'leverage wajib integer antara 1 dan 125.' };
    }
    value.leverage = leverage;
  }
  if (payload.marginMode !== undefined) {
    const marginMode = String(payload.marginMode).toUpperCase();
    if (!ALLOWED_MARGIN_MODES.has(marginMode)) return { valid: false, error: 'marginMode wajib CROSS atau ISOLATED.' };
    value.marginMode = marginMode;
  }
  if (payload.createdAt !== undefined) {
    const createdAt = validateTimestamp(payload.createdAt, 'createdAt');
    if (createdAt.error) return { valid: false, error: createdAt.error };
    value.createdAt = createdAt.value;
  }
  if (payload.openTime !== undefined) {
    const openTime = validateTimestamp(payload.openTime, 'openTime');
    if (openTime.error) return { valid: false, error: openTime.error };
    value.openTime = openTime.value;
  }
  return { valid: true, value };
}

module.exports = {
  ALLOWED_PAIRS,
  MAX_ACTIVE_POSITIONS_PER_USER,
  MAX_DEMO_AMOUNT,
  validatePositionPayload,
  validatePositionPatchPayload
};
