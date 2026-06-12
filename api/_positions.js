const { getActivePositionsByUser, saveActivePositionsByUser } = require('./_redis');
const { MAX_ACTIVE_POSITIONS_PER_USER, validatePositionPayload, validatePositionPatchPayload } = require('./_validation');

function publicError(res, statusCode, error) {
  return res.status(statusCode).json({ success: false, error });
}

function getPositionId(req) {
  const fromBody = req.body && typeof req.body === 'object' ? req.body.id : undefined;
  const fromQuery = req.query && typeof req.query === 'object' ? req.query.id : undefined;
  const id = String(fromBody ?? fromQuery ?? '').trim();
  return id;
}

function findDuplicatePosition(positions, id) {
  return positions.find((position) => String(position?.id) === String(id));
}

async function listPositions(userId) {
  const positions = await getActivePositionsByUser(userId);
  return Array.isArray(positions) ? positions : [];
}

async function savePosition(userId, payload) {
  const validation = validatePositionPayload(payload);
  if (!validation.valid) return { statusCode: 400, error: validation.error };

  const positions = await listPositions(userId);
  if (findDuplicatePosition(positions, validation.value.id)) {
    return { statusCode: 409, error: 'id posisi sudah aktif untuk user ini.' };
  }
  if (positions.length >= MAX_ACTIVE_POSITIONS_PER_USER) {
    return { statusCode: 400, error: `Maksimal ${MAX_ACTIVE_POSITIONS_PER_USER} posisi aktif per user untuk mode demo.` };
  }

  const now = Date.now();
  const positionToSave = {
    ...validation.value,
    lastSuccessfulPriceCheck: validation.value.lastSuccessfulPriceCheck || now,
    lastKnownPrice: validation.value.lastKnownPrice || validation.value.entryPrice
  };
  const nextPositions = positions.concat(positionToSave);
  await saveActivePositionsByUser(userId, nextPositions);
  return { statusCode: 200, body: { success: true, total_positions: nextPositions.length, position: positionToSave } };
}

async function deletePosition(userId, id) {
  if (!id) return { statusCode: 400, error: 'id posisi wajib diisi.' };
  const positions = await listPositions(userId);
  const nextPositions = positions.filter((position) => String(position?.id) !== String(id));
  if (nextPositions.length === positions.length) {
    return { statusCode: 404, error: 'posisi tidak ditemukan untuk user ini.' };
  }
  await saveActivePositionsByUser(userId, nextPositions);
  return { statusCode: 200, body: { success: true, deleted: true, total_positions: nextPositions.length } };
}

async function updatePosition(userId, payload) {
  const validation = validatePositionPatchPayload(payload);
  if (!validation.valid) return { statusCode: 400, error: validation.error };

  const positions = await listPositions(userId);
  const index = positions.findIndex((position) => String(position?.id) === validation.value.id);
  if (index === -1) return { statusCode: 404, error: 'posisi tidak ditemukan untuk user ini.' };

  const current = positions[index];
  const candidate = { ...current, ...validation.value };
  const fullValidation = validatePositionPayload(candidate);
  if (!fullValidation.valid) return { statusCode: 400, error: fullValidation.error };

  positions[index] = { ...current, ...fullValidation.value, id: String(current.id) };
  await saveActivePositionsByUser(userId, positions);
  return { statusCode: 200, body: { success: true, position: positions[index], total_positions: positions.length } };
}

module.exports = {
  publicError,
  getPositionId,
  listPositions,
  savePosition,
  deletePosition,
  updatePosition
};
