const { createRemoteJWKSet, jwtVerify } = require('jose');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` : '');
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const supabaseJwks = SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(SUPABASE_JWKS_URL)) : null;
const firebaseJwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

async function verifySupabaseToken(token) {
  if (!supabaseJwks) throw new Error('Supabase JWKS URL belum dikonfigurasi.');
  const { payload } = await jwtVerify(token, supabaseJwks);
  return payload;
}

async function verifyFirebaseToken(token) {
  if (!FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID belum dikonfigurasi.');
  const { payload } = await jwtVerify(token, firebaseJwks, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID
  });
  return payload;
}

async function requireAuth(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Unauthorized: Bearer token tidak ditemukan.');
    err.statusCode = 401;
    throw err;
  }

  const token = authHeader.slice(7).trim();
  let payload;

  try {
    payload = await verifySupabaseToken(token);
  } catch {
    payload = await verifyFirebaseToken(token);
  }

  const userId = payload.sub || payload.user_id;
  if (!userId) {
    const err = new Error('Unauthorized: userId tidak ada pada token.');
    err.statusCode = 401;
    throw err;
  }

  return { userId, tokenPayload: payload };
}

module.exports = { requireAuth };
