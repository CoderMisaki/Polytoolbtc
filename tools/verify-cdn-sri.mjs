#!/usr/bin/env node
import { createHash } from 'node:crypto';

const cdnAssets = [
  {
    name: 'lightweight-charts',
    url: 'https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js'
  },
  {
    name: 'supabase-js',
    url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4'
  }
];

async function fetchAsset({ name, url }) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Polytoolbtc-SRI-Verifier/1.0'
    }
  });
  if (!response.ok) {
    throw new Error(`${name}: ${url} returned HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`${name}: downloaded asset is empty`);
  const integrity = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
  return { name, url, bytes: bytes.length, integrity };
}

try {
  const results = [];
  for (const asset of cdnAssets) results.push(await fetchAsset(asset));
  for (const result of results) {
    console.log(`${result.name}`);
    console.log(`  url: ${result.url}`);
    console.log(`  bytes: ${result.bytes}`);
    console.log(`  integrity: ${result.integrity}`);
    console.log(`  script: <script src="${result.url}" integrity="${result.integrity}" crossorigin="anonymous"></script>`);
  }
} catch (error) {
  console.error(error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message);
  process.exitCode = 1;
}
