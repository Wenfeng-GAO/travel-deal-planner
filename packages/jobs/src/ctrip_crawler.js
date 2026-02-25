import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { hashSnapshot } from '../../data/src/amadeus.js';
import { openDb, hasCtripPrice, insertCtripPrice, insertCtripRaw, insertCtripError } from '../../data/src/db.js';
import { resolveRepoRoot } from '../../data/src/env.js';

const OTA = 'ctrip';

function loadConfig() {
  const root = resolveRepoRoot();
  const configPath = path.join(root, '.ctrip.config.json');
  const defaultConfig = {
    origin: 'PVG',
    destination: 'URC',
    window_days: 30,
    headless: true,
    timeout_ms: 25000,
    skip_existing: true
  };
  if (!fs.existsSync(configPath)) {
    return { ...defaultConfig, configPath };
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return { ...defaultConfig, ...parsed, configPath };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function dateRange(start, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    out.push(formatDate(addDays(start, i)));
  }
  return out;
}

function buildUrl(origin, destination, date) {
  const o = origin.toLowerCase();
  const d = destination.toLowerCase();
  return `https://flights.ctrip.com/online/list/oneway-${o}-${d}?depdate=${date}&cabin=y_s&adult=1&child=0&infant=0`;
}

function extractPricesFromJson(value, prices) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) extractPricesFromJson(item, prices);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      if (/price/i.test(key)) {
        const num = Number(val);
        if (Number.isFinite(num)) prices.push(num);
      }
      extractPricesFromJson(val, prices);
    }
  }
}

function extractPricesFromText(text) {
  const prices = [];
  const regex = /[¥￥]\s*(\d{2,6})/g;
  let match;
  while ((match = regex.exec(text))) {
    prices.push(Number(match[1]));
  }
  return prices;
}

function selectMinPrice(prices) {
  const filtered = prices.filter((p) => Number.isFinite(p) && p >= 100 && p <= 20000);
  if (!filtered.length) return null;
  return Math.min(...filtered);
}

async function run() {
  const cfg = loadConfig();
  const origin = String(cfg.origin).toUpperCase();
  const destination = String(cfg.destination).toUpperCase();
  const windowDays = Number(cfg.window_days) || 30;
  const timeoutMs = Number(cfg.timeout_ms) || 25000;
  const skipExisting = cfg.skip_existing !== false;
  const minPriceFloor = Number(cfg.min_price_floor) || 300;

  const start = addDays(new Date(), 1);
  const dates = dateRange(start, windowDays);

  const root = resolveRepoRoot();
  const rawDir = path.join(root, 'storage', 'ctrip', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const db = openDb();
  const browser = await chromium.launch({ headless: Boolean(cfg.headless) });
  const page = await browser.newPage();

  for (const date of dates) {
    if (skipExisting && hasCtripPrice(db, { origin, destination, date })) {
      console.log(JSON.stringify({ origin, destination, date, skipped: 'exists' }));
      continue;
    }

    const url = buildUrl(origin, destination, date);
    const jsonPrices = [];
    const responseBodies = [];

    const onResponse = async (response) => {
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return;
      try {
        const text = await response.text();
        responseBodies.push(text);
        const parsed = JSON.parse(text);
        extractPricesFromJson(parsed, jsonPrices);
      } catch (_) {
        // ignore parse failures
      }
    };

    page.on('response', onResponse);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
      const html = await page.content();
      const htmlPrices = extractPricesFromText(html);
      const preferred = jsonPrices.length ? jsonPrices : htmlPrices;
      const minPrice = selectMinPrice(preferred);

      const rawPath = path.join(rawDir, `${origin}-${destination}-${date}.html`);
      fs.writeFileSync(rawPath, html);

      const rawId = hashSnapshot({ ota: OTA, origin, destination, date, type: 'html' });
      insertCtripRaw(db, {
        id: rawId,
        ota: OTA,
        origin,
        destination,
        date,
        raw_path: rawPath
      });

      if (!minPrice) {
        const errId = hashSnapshot({ ota: OTA, origin, destination, date, type: 'no_price' });
        insertCtripError(db, {
          id: errId,
          ota: OTA,
          origin,
          destination,
          date,
          error_type: 'price_not_found',
          error_message: 'no price found in html/json'
        });
        console.warn(JSON.stringify({ origin, destination, date, error: 'price_not_found' }));
        continue;
      }

      if (minPrice < minPriceFloor) {
        const errId = hashSnapshot({ ota: OTA, origin, destination, date, type: 'suspicious_price' });
        insertCtripError(db, {
          id: errId,
          ota: OTA,
          origin,
          destination,
          date,
          error_type: 'suspicious_price',
          error_message: `min_price ${minPrice} below floor ${minPriceFloor}`
        });
        console.warn(JSON.stringify({ origin, destination, date, error: 'suspicious_price', min_price: minPrice }));
        continue;
      }

      const priceId = hashSnapshot({ ota: OTA, origin, destination, date });
      insertCtripPrice(db, {
        id: priceId,
        ota: OTA,
        origin,
        destination,
        date,
        min_price: minPrice,
        currency: 'CNY',
        source: jsonPrices.length ? 'json' : 'html'
      });

      console.log(JSON.stringify({ origin, destination, date, min_price: minPrice }));
    } catch (err) {
      const errId = hashSnapshot({ ota: OTA, origin, destination, date, type: 'exception' });
      insertCtripError(db, {
        id: errId,
        ota: OTA,
        origin,
        destination,
        date,
        error_type: 'exception',
        error_message: String(err?.message ?? err)
      });
      console.warn(JSON.stringify({ origin, destination, date, error: String(err?.message ?? err) }));
    } finally {
      page.off('response', onResponse);
    }
  }

  await browser.close();
  db.close();
}

run().catch((err) => {
  console.error(`[ctrip] crawler failed: ${String(err?.message ?? err)}`);
  process.exit(1);
});
