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
    window_days: 330,
    headless: true,
    timeout_ms: 25000,
    skip_existing: true,
    min_price_floor: 300,
    dump_json: false
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

function findTime(value) {
  if (!value) return null;
  const str = String(value);
  if (/\d{2}:\d{2}/.test(str)) return str;
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return str;
  return null;
}

function pushItineraryCandidates(itinerary, out, url) {
  if (!itinerary) return;
  const segments = Array.isArray(itinerary.flightSegments) ? itinerary.flightSegments : [];
  if (!segments.length) return;

  const firstSegment = segments[0] ?? {};
  const lastSegment = segments[segments.length - 1] ?? {};
  const firstFlight = Array.isArray(firstSegment.flightList) ? (firstSegment.flightList[0] ?? {}) : {};
  const lastFlightList = Array.isArray(lastSegment.flightList) ? lastSegment.flightList : [];
  const lastFlight = lastFlightList.length ? lastFlightList[lastFlightList.length - 1] : {};

  const depart = findTime(
    firstFlight.departureDateTime ||
      firstFlight.departureTime ||
      firstFlight.depTime ||
      firstSegment.departureDateTime ||
      firstSegment.departureTime
  );
  const arrive = findTime(
    lastFlight.arrivalDateTime ||
      lastFlight.arrivalTime ||
      lastFlight.arrTime ||
      lastSegment.arrivalDateTime ||
      lastSegment.arrivalTime
  );
  const airline =
    firstFlight.marketAirlineName ||
    firstFlight.airlineName ||
    firstSegment.airlineName ||
    firstFlight.marketAirlineCode ||
    firstFlight.airlineCode ||
    firstSegment.airlineCode ||
    null;
  const flightNo = firstFlight.flightNo || firstFlight.flightNumber || firstFlight.marketingFlightNo || null;

  const stops =
    (Number.isFinite(firstSegment.transferCount) && Number(firstSegment.transferCount)) ||
    (Number.isFinite(firstSegment.stopCount) && Number(firstSegment.stopCount)) ||
    (Number.isFinite(itinerary.transferCount) && Number(itinerary.transferCount)) ||
    (Number.isFinite(itinerary.stopCount) && Number(itinerary.stopCount)) ||
    Math.max(segments.length - 1, 0);

  const priceList = Array.isArray(itinerary.priceList) ? itinerary.priceList : [];
  if (priceList.length) {
    for (const priceItem of priceList) {
      const price =
        priceItem?.adultPrice ??
        priceItem?.sortPrice ??
        priceItem?.totalPrice ??
        priceItem?.price ??
        priceItem?.amount;
      if (!Number.isFinite(price)) continue;
      out.push({
        price: Number(price),
        airline,
        flight_no: flightNo,
        depart_time: depart,
        arrive_time: arrive,
        stops,
        source_url: url
      });
    }
    return;
  }

  const fallbackPrice =
    itinerary?.minPrice ??
    itinerary?.lowestPrice ??
    itinerary?.salePrice ??
    itinerary?.totalPrice ??
    itinerary?.price ??
    itinerary?.amount;
  if (Number.isFinite(fallbackPrice)) {
    out.push({
      price: Number(fallbackPrice),
      airline,
      flight_no: flightNo,
      depart_time: depart,
      arrive_time: arrive,
      stops,
      source_url: url
    });
  }
}

function extractFlightCandidatesFromCtrip(value, out, url) {
  const list = value?.data?.flightItineraryList || value?.flightItineraryList;
  if (!Array.isArray(list)) return false;
  for (const itinerary of list) {
    pushItineraryCandidates(itinerary, out, url);
  }
  return true;
}

function extractFlightCandidatesFromJson(value, out, url) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) extractFlightCandidatesFromJson(item, out, url);
    return;
  }
  if (typeof value !== 'object') return;

  if (extractFlightCandidatesFromCtrip(value, out, url)) return;

  if (Array.isArray(value.flightSegments) && Array.isArray(value.priceList)) {
    pushItineraryCandidates(value, out, url);
    return;
  }

  for (const val of Object.values(value)) {
    extractFlightCandidatesFromJson(val, out, url);
  }
}

async function run() {
  const cfg = loadConfig();
  const origin = String(cfg.origin).toUpperCase();
  const destination = String(cfg.destination).toUpperCase();
  const windowDays = Number(cfg.window_days) || 30;
  const timeoutMs = Number(cfg.timeout_ms) || 25000;
  const skipExisting = cfg.skip_existing !== false;
  const minPriceFloor = Number(cfg.min_price_floor) || 300;
  const dumpJson = Boolean(cfg.dump_json);

  const start = addDays(new Date(), 1);
  const dates = dateRange(start, windowDays);

  const root = resolveRepoRoot();
  const rawDir = path.join(root, 'storage', 'ctrip', 'raw');
  const jsonDir = path.join(root, 'storage', 'ctrip', 'json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(jsonDir, { recursive: true });

  const db = openDb();
  const browser = await chromium.launch({ headless: Boolean(cfg.headless) });
  const page = await browser.newPage();

  for (const date of dates) {
    if (skipExisting && hasCtripPrice(db, { origin, destination, date })) {
      console.log(JSON.stringify({ origin, destination, date, skipped: 'exists' }));
      continue;
    }

    const url = buildUrl(origin, destination, date);
    const candidates = [];
    let jsonDumpIndex = 0;

    const onResponse = async (response) => {
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return;
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        extractFlightCandidatesFromJson(parsed, candidates, response.url());

        if (dumpJson && (candidates.length > 0 || /flight|list|search|itinerary/i.test(response.url()))) {
          const file = path.join(jsonDir, `${origin}-${destination}-${date}-${jsonDumpIndex}.json`);
          fs.writeFileSync(file, text);
          jsonDumpIndex += 1;
        }
      } catch (_) {
        // ignore parse failures
      }
    };

    page.on('response', onResponse);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
      const html = await page.content();

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

      const filteredCandidates = candidates.filter((c) => Number.isFinite(c.price));
      const preferred = filteredCandidates.length ? filteredCandidates : [];
      const minCandidate = preferred.length
        ? preferred.reduce((a, b) => (a.price <= b.price ? a : b))
        : null;

      const minPrice = minCandidate ? minCandidate.price : null;

      if (!minPrice) {
        const errId = hashSnapshot({ ota: OTA, origin, destination, date, type: 'no_price' });
        insertCtripError(db, {
          id: errId,
          ota: OTA,
          origin,
          destination,
          date,
          error_type: 'price_not_found',
          error_message: 'no price found in json/html'
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
        source: minCandidate ? 'json' : 'html',
        airline: minCandidate?.airline ?? null,
        flight_no: minCandidate?.flight_no ?? null,
        depart_time: minCandidate?.depart_time ?? null,
        arrive_time: minCandidate?.arrive_time ?? null,
        stops: minCandidate?.stops ?? null
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
