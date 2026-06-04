# Masako Terminal (Polytoolbtc)

Masako Terminal adalah **terminal trading demo/simulasi edukasi** untuk BTC/crypto. Aplikasi ini menampilkan chart, indikator, sinyal AI/heuristik, pencatatan prediksi Polymarket, simulasi futures, autentikasi, dan penyimpanan posisi demo per user melalui Vercel Functions + Redis.

> **DEMO MODE:** proyek ini tidak melakukan order real ke exchange, bukan saran finansial, dan sinyal AI/indikator tidak menjamin profit atau akurasi. Jangan gunakan sebagai dasar tunggal keputusan finansial.

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-success?logo=vercel&logoColor=white)](https://polytoolbtc.vercel.app)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-68a063?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-Upstash%20Redis-ff4e00?logo=redis&logoColor=white)](https://upstash.com/)

---

## Core Architecture

- **Frontend demo terminal:** chart, indikator teknikal, badge feed, ledger, Polymarket prediction logging, dan simulasi futures LONG/SHORT/AI.
- **Backend Vercel Functions:** validasi payload posisi, autentikasi bearer token, rate limit sederhana, dan pengecekan SL/TP demo per user.
- **Redis storage:** posisi aktif disimpan sebagai sumber utama per user dengan key `masako_positions_${userId}`. Endpoint legacy global `cron-bot` dinonaktifkan agar tidak menutup posisi milik user secara salah.

---

## Key Features

1. **Market dashboard demo**
   - Lightweight Charts.
   - Feed WebSocket Binance/Bybit dan fallback HTTP candle Binance.
   - Badge status source/latency termasuk kondisi error feed.

2. **Simulasi futures**
   - LONG/SHORT/AI execute hanya membuat posisi demo.
   - TP/SL, trailing stop, break-even, dan ledger berjalan di sisi simulasi.
   - Backend menolak payload posisi yang tidak valid atau melebihi batas posisi aktif.

3. **Auth + storage**
   - Token Supabase/Firebase diverifikasi di backend.
   - Supabase anon key boleh berada di frontend untuk auth browser, tetapi **RLS wajib aktif** di Supabase. Jangan pernah menaruh service-role key di frontend.

---

## Local Development

### Prasyarat

- Node.js 18+.
- npm.
- Vercel CLI opsional untuk menjalankan Functions secara lokal.

### Install

```bash
npm install
```

### Jalankan frontend statis

Anda bisa membuka `index.html` melalui static server lokal, misalnya:

```bash
npx serve .
```

Lalu buka URL lokal yang ditampilkan oleh `serve`.

### Jalankan backend lokal dengan Vercel CLI

```bash
npx vercel dev
```

Pastikan environment variable backend tersedia sebelum memanggil endpoint API.

---

## Environment Variables

Konfigurasikan variabel berikut di Vercel atau environment lokal untuk backend:

| Variable | Wajib | Deskripsi |
| :--- | :---: | :--- |
| `SUPABASE_URL` | Jika memakai Supabase token | URL project Supabase. Digunakan untuk membentuk JWKS URL default. |
| `SUPABASE_JWKS_URL` | Opsional | Override JWKS URL Supabase jika perlu. |
| `FIREBASE_PROJECT_ID` | Jika memakai Firebase token | Audience/issuer Firebase token. |
| `DB_KV_REST_API_URL` | Ya untuk Redis | Upstash Redis REST URL. |
| `DB_KV_REST_API_TOKEN` | Ya untuk Redis | Upstash Redis REST bearer token. Simpan hanya di backend/Vercel env. |

Catatan keamanan:

- Supabase anon key pada `src/config.js` adalah public browser key, bukan secret. Tetap wajib aktifkan Row Level Security (RLS) dan policy yang benar di Supabase.
- Jangan commit `.env`, `.env.*`, `.vercel`, log, coverage, Redis token, service-role key, atau private key.

---

## Testing

Jalankan seluruh test:

```bash
npm test
```

Test mencakup:

- Validasi backend `save-position` termasuk auth kosong, body kosong, angka invalid, relasi TP/SL LONG/SHORT, leverage, whitelist pair/type, dan limit posisi aktif.
- Trading logic `shouldClosePosition()` untuk SL/TP LONG/SHORT dan kondisi tetap terbuka.
- Utility formatting, storage fallback tanpa `localStorage`, dan kalkulasi PnL LONG/SHORT.

---

## Deployment Note

Project dikonfigurasi untuk region Vercel `sin1`. Header keamanan didefinisikan di `vercel.json`, termasuk CSP realistis untuk CDN chart/Supabase dan koneksi market data yang dibutuhkan frontend. Upstash Redis hanya digunakan dari backend dan tidak diekspos ke frontend.

TODO CSP: `style-src 'unsafe-inline'` masih dipertahankan karena sebagian UI legacy masih memakai inline style. Target hardening berikutnya adalah memindahkan inline style ke class CSS agar CSP dapat dibuat lebih ketat.

---

## Manual Browser QA Checklist

- Buka aplikasi dan pastikan label **DEMO MODE** terlihat di header/futures panel.
- Login/logout berjalan.
- Chart load dan badge feed/latency berubah; bila feed gagal, UI tidak crash dan badge menampilkan error.
- Ubah pair/timeframe dan pastikan chart re-render.
- Buat posisi LONG/SHORT simulasi dan pastikan muncul di panel posisi.
- Jalankan AI EXECUTE simulasi dan pastikan tidak ada klaim profit/akurasi.
- Buka ledger/history, filter log, clear log, dan modal action di desktop serta mobile.
- Uji layar kecil: header wrap dengan rapi, panel kanan/ledger bisa discroll, dan tombol trading nyaman untuk tap.

---

**Developed by [CoderMisaki](https://github.com/CoderMisaki)**
