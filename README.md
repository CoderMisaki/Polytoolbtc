# Masako Terminal (Polytoolbtc)

Masako Terminal is a high-performance, serverless cryptocurrency trading interface and automated management system. It integrates real-time market intelligence, advanced charting, and automated risk management protocols (SL/TP) via a distributed serverless architecture.

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-success?logo=vercel&logoColor=white)](https://polytoolbtc.vercel.app)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-68a063?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-Upstash%20Redis-ff4e00?logo=redis&logoColor=white)](https://upstash.com/)

---

## 🚀 Core Architecture

The project is split into a sophisticated frontend "Intelligence Engine" and a backend "Execution Layer" to ensure 24/7 monitoring without maintaining a heavy server.

- **Frontend Engine:** Implements advanced technical indicators (ST, MACD, RSI, BB, etc.) and a custom AI Intelligence Pipeline to calculate real-time trade signals.
- **Backend (Serverless):** Hosted on Vercel Functions (Singapore Region) to intercept Binance API restrictions and execute automated SL/TP checks.
- **State Management:** Utilizes Upstash Redis (Serverless) for ultra-low latency position tracking and cross-session persistence.

---

## 🛠️ Key Features

### 1. Intelligence Pipeline
- **Multi-Strategy Analysis:** Combines Trend, Mean Reversion, Breakout, Liquidity, and Whale tracking models.
- **Confidence Scoring:** Real-time probability calculation for trade signals using smoothed exponential averages.
- **Orderflow Integration:** Real-time tracking of Binance Sentiment (Long/Short Ratios, Funding Rates, and Open Interest).

### 2. Automated Execution Layer
- **Cron-Job Monitoring:** Integration with external cron services to trigger SL/TP checks every 60 seconds.
- **Smart Risk Protocols:**
  - **ATR-Based Trailing Stop:** Dynamic stop-loss adjustment based on market volatility.
  - **Auto Break-Even:** Automatic SL migration to entry price once 1:1 Risk-Reward is achieved.
  - **Hedging Trailing Stop:** Synergistic management of Long/Short cross-positions.

### 3. Pro Terminal UI
- **Lightweight Charts Integration:** High-performance financial visualization.
- **Responsive Design:** Optimized for mobile and desktop "Terminal" experience.
- **Venues Aggregation:** Low-latency feed switching between Binance and Bybit WebSockets.

---

## ⚙️ Environment Variables

To run the backend, configure the following variables in your Vercel/Environment settings:

| Variable | Description |
| :--- | :--- |
| `DB_KV_REST_API_URL` | Upstash Redis REST URL |
| `DB_KV_REST_API_TOKEN` | Upstash Redis REST Bearer Token |

---

## 🌍 Deployment Note

This project **MUST** be deployed in the **Singapore (sin1)** region on Vercel to avoid `HTTP 451` errors from Binance API Geofencing. The configuration is handled automatically via `vercel.json`.

---

## ⚖️ Disclaimer

This terminal is for educational and simulation purposes. Trading cryptocurrencies involves significant risk. Always use proper risk management and never trade more than you can afford to lose.

---

**Developed by [CoderMisaki](https://github.com/CoderMisaki)**
