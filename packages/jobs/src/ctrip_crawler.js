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
    request_delay_ms: 2000,
    min_price_floor: 300,
    dump_json: false,
    dump_all_json: false,
    start_date: null,
    page_wait_ms: 8000,
    cookies_path: null,
    storage_state_path: null,
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    timezone_id: 'Asia/Shanghai'
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

function pickAirport(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function parseDateTime(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str || /^\d{2}:\d{2}$/.test(str)) return null;
  const normalized = str.includes('T') ? str : str.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatLayover(minutes) {
  if (!Number.isFinite(minutes)) return '停留时间未知';
  const total = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs > 0 && mins > 0) return `${hrs}小时${mins}分`;
  if (hrs > 0) return `${hrs}小时`;
  return `${mins}分`;
}

function extractLegs(segments) {
  const legs = [];
  for (const segment of segments) {
    const flights = Array.isArray(segment.flightList) ? segment.flightList : [];
    if (flights.length) {
      for (const flight of flights) {
        legs.push({
          depart_time: findTime(
            flight.departureDateTime ||
              flight.departureTime ||
              flight.depTime ||
              segment.departureDateTime ||
              segment.departureTime
          ),
          arrive_time: findTime(
            flight.arrivalDateTime ||
              flight.arrivalTime ||
              flight.arrTime ||
              segment.arrivalDateTime ||
              segment.arrivalTime
          ),
          depart_time_raw:
            flight.departureDateTime ||
            flight.departureTime ||
            flight.depTime ||
            segment.departureDateTime ||
            segment.departureTime ||
            null,
          arrive_time_raw:
            flight.arrivalDateTime ||
            flight.arrivalTime ||
            flight.arrTime ||
            segment.arrivalDateTime ||
            segment.arrivalTime ||
            null,
          depart_airport: pickAirport(
            flight.departureAirportName,
            flight.departureAirportShortName,
            flight.departureAirport,
            flight.departureAirportCode,
            flight.departureCityName,
            flight.departureCityCode,
            segment.departureAirportName,
            segment.departureAirportShortName,
            segment.departureAirport,
            segment.departureAirportCode,
            segment.departureCityName,
            segment.departureCityCode
          ),
          arrive_airport: pickAirport(
            flight.arrivalAirportName,
            flight.arrivalAirportShortName,
            flight.arrivalAirport,
            flight.arrivalAirportCode,
            flight.arrivalCityName,
            flight.arrivalCityCode,
            segment.arrivalAirportName,
            segment.arrivalAirportShortName,
            segment.arrivalAirport,
            segment.arrivalAirportCode,
            segment.arrivalCityName,
            segment.arrivalCityCode
          )
        });
      }
      continue;
    }
    legs.push({
      depart_time: findTime(segment.departureDateTime || segment.departureTime || segment.depTime),
      arrive_time: findTime(segment.arrivalDateTime || segment.arrivalTime || segment.arrTime),
      depart_time_raw: segment.departureDateTime || segment.departureTime || segment.depTime || null,
      arrive_time_raw: segment.arrivalDateTime || segment.arrivalTime || segment.arrTime || null,
      depart_airport: pickAirport(
        segment.departureAirportName,
        segment.departureAirportShortName,
        segment.departureAirport,
        segment.departureAirportCode,
        segment.departureCityName,
        segment.departureCityCode
      ),
      arrive_airport: pickAirport(
        segment.arrivalAirportName,
        segment.arrivalAirportShortName,
        segment.arrivalAirport,
        segment.arrivalAirportCode,
        segment.arrivalCityName,
        segment.arrivalCityCode
      )
    });
  }
  return legs;
}

function buildTransferDetails(legs) {
  if (!Array.isArray(legs) || legs.length <= 1) {
    return { details: null, count: 0 };
  }
  const items = [];
  for (let i = 0; i < legs.length - 1; i += 1) {
    const stop = legs[i].arrive_airport || '未知';
    const arrive = parseDateTime(legs[i].arrive_time_raw || legs[i].arrive_time);
    const depart = parseDateTime(legs[i + 1].depart_time_raw || legs[i + 1].depart_time);
    let layover = null;
    if (arrive && depart) {
      const diff = Math.round((depart - arrive) / 60000);
      if (Number.isFinite(diff) && diff >= 0) {
        layover = diff;
      }
    }
    items.push(`${stop} ${formatLayover(layover)}`);
  }
  return { details: items.join(' / '), count: items.length };
}

function normalizeSameSite(value) {
  if (!value) return 'Lax';
  const v = String(value).toLowerCase();
  if (v === 'strict') return 'Strict';
  if (v === 'none' || v === 'no_restriction') return 'None';
  return 'Lax';
}

function normalizeCookie(cookie) {
  if (!cookie || !cookie.name) return null;
  const rawExpires = cookie.expires ?? cookie.expirationDate ?? cookie.expiry ?? cookie.expiration;
  let expires = Number(rawExpires);
  if (Number.isFinite(expires) && expires > 1e12) {
    expires = Math.floor(expires / 1000);
  }
  if (!Number.isFinite(expires)) {
    expires = -1;
  }
  return {
    name: String(cookie.name),
    value: String(cookie.value ?? ''),
    domain: cookie.domain || cookie.host || '',
    path: cookie.path || '/',
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: normalizeSameSite(cookie.sameSite),
    expires
  };
}

function loadCookies(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.cookies) ? parsed.cookies : [];
  return list
    .map((cookie) => normalizeCookie(cookie))
    .filter((cookie) => cookie && cookie.name && cookie.domain);
}

function pushItineraryCandidates(itinerary, out, url) {
  if (!itinerary) return;
  const segments = Array.isArray(itinerary.flightSegments) ? itinerary.flightSegments : [];
  if (!segments.length) return;

  const legs = extractLegs(segments);
  const transferInfo = buildTransferDetails(legs);
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

  let stops =
    (Number.isFinite(firstSegment.transferCount) && Number(firstSegment.transferCount)) ||
    (Number.isFinite(firstSegment.stopCount) && Number(firstSegment.stopCount)) ||
    (Number.isFinite(itinerary.transferCount) && Number(itinerary.transferCount)) ||
    (Number.isFinite(itinerary.stopCount) && Number(itinerary.stopCount)) ||
    null;
  if (!Number.isFinite(stops)) {
    stops = Math.max(transferInfo.count, segments.length - 1, 0);
  }

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
        transfer_details: transferInfo.details,
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
      transfer_details: transferInfo.details,
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
  const requestDelayMs = Number(cfg.request_delay_ms) || 0;
  const minPriceFloor = Number(cfg.min_price_floor) || 300;
  const dumpJson = Boolean(cfg.dump_json);
  const dumpAllJson = Boolean(cfg.dump_all_json);
  const pageWaitMs = Number(cfg.page_wait_ms) || 0;
  const userAgent = String(cfg.user_agent || '');
  const locale = String(cfg.locale || 'zh-CN');
  const timezoneId = String(cfg.timezone_id || 'Asia/Shanghai');
  const cookiesPath = cfg.cookies_path
    ? path.isAbsolute(cfg.cookies_path)
      ? cfg.cookies_path
      : path.join(resolveRepoRoot(), cfg.cookies_path)
    : null;
  const storageStatePath = cfg.storage_state_path
    ? path.isAbsolute(cfg.storage_state_path)
      ? cfg.storage_state_path
      : path.join(resolveRepoRoot(), cfg.storage_state_path)
    : null;

  const start = cfg.start_date
    ? new Date(`${cfg.start_date}T00:00:00Z`)
    : addDays(new Date(), 1);
  const dates = dateRange(start, windowDays);

  const root = resolveRepoRoot();
  const rawDir = path.join(root, 'storage', 'ctrip', 'raw');
  const jsonDir = path.join(root, 'storage', 'ctrip', 'json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(jsonDir, { recursive: true });

  const db = openDb();
  const browser = await chromium.launch({
    headless: Boolean(cfg.headless),
    args: ['--disable-blink-features=AutomationControlled']
  });

  for (const date of dates) {
    if (skipExisting && hasCtripPrice(db, { origin, destination, date })) {
      console.log(JSON.stringify({ origin, destination, date, skipped: 'exists' }));
      continue;
    }

    const url = buildUrl(origin, destination, date);
    const candidates = [];
    let jsonDumpIndex = 0;
    const contextOptions = {
      userAgent,
      locale,
      timezoneId,
      viewport: { width: 1365, height: 768 }
    };
    if (storageStatePath && fs.existsSync(storageStatePath)) {
      contextOptions.storageState = storageStatePath;
    }
    const context = await browser.newContext(contextOptions);
    if (cookiesPath) {
      const cookies = loadCookies(cookiesPath);
      if (cookies.length) {
        await context.addCookies(cookies);
      }
    }
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });
    const page = await context.newPage();

    const onResponse = async (response) => {
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return;
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        extractFlightCandidatesFromJson(parsed, candidates, response.url());

        if (dumpJson && (dumpAllJson || candidates.length > 0 || /flight|list|search|itinerary/i.test(response.url()))) {
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
      if (pageWaitMs > 0) {
        await page.waitForTimeout(pageWaitMs);
      }
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

      const filteredCandidates = candidates
        .filter((c) => Number.isFinite(c.price))
        .map((c) => ({
          ...c,
          price: Number(c.price),
          stops: Number.isFinite(c.stops) ? Number(c.stops) : null
        }));
      const preferred = filteredCandidates.length ? filteredCandidates : [];
      const minCandidate = preferred.length
        ? preferred.reduce((a, b) => (a.price <= b.price ? a : b))
        : null;
      const directList = preferred.filter((c) => Number.isFinite(c.stops) && c.stops === 0);
      const directCandidate = directList.length ? directList.reduce((a, b) => (a.price <= b.price ? a : b)) : null;

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
        stops: minCandidate?.stops ?? null,
        transfer_details: minCandidate?.transfer_details ?? null,
        direct_min_price: directCandidate?.price ?? null,
        direct_airline: directCandidate?.airline ?? null,
        direct_flight_no: directCandidate?.flight_no ?? null,
        direct_depart_time: directCandidate?.depart_time ?? null,
        direct_arrive_time: directCandidate?.arrive_time ?? null,
        direct_stops: directCandidate?.stops ?? null
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
      await page.close();
      await context.close();
    }

    if (requestDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    }
  }

  await browser.close();
  db.close();
}

run().catch((err) => {
  console.error(`[ctrip] crawler failed: ${String(err?.message ?? err)}`);
  process.exit(1);
});
