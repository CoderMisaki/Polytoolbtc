function setCors(req, res) {
  const allowedOrigins = [
    'https://polytoolbtc.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  const reqOrigin = req.headers.origin;
  const allowAllDev = process.env.NODE_ENV !== 'production';
  const origin = allowAllDev ? (reqOrigin || '*') : (allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0]);

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}
module.exports = { setCors };
