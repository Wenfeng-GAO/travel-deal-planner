import {
  loadEnv,
  getAmadeusToken,
  searchFlightOffers,
  normalizeFlightOffers,
  hashSnapshot,
  REQUEST_SLEEP_MS,
  ROUTES
} from '../../data/src/index.js';
import { openDb, insertFlightSnapshot, hasSnapshot } from '../../data/src/db.js';

loadEnv();

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function toDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dateRange(start, end) {
  const out = [];
  let cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    out.push(formatDate(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const args = parseArgs(process.argv);
  const pastDays = args['past-days'] ? Number(args['past-days']) : 365;
  const futureDays = args['future-days'] ? Number(args['future-days']) : 365;
  const includePast = Boolean(args['force-past']);
  const skipExisting = args['skip-existing'] !== 'false';
  const startArg = args['start'] ? toDate(args['start']) : null;
  const endArg = args['end'] ? toDate(args['end']) : null;

  if ((args.origin && !args.destination) || (!args.origin && args.destination)) {
    throw new Error('origin and destination must be provided together');
  }

  const today = new Date();
  const start = startArg ?? addDays(today, -pastDays);
  const end = endArg ?? addDays(today, futureDays);
  const dates = dateRange(start, end);

  const routes = args.origin && args.destination
    ? [{ origin: String(args.origin).toUpperCase(), destination: String(args.destination).toUpperCase() }]
    : ROUTES;

  const db = openDb();
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('missing env AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET');
  }

  const tokenRes = await getAmadeusToken({ clientId, clientSecret });

  for (const r of routes) {
    for (const date of dates) {
      const dateObj = toDate(date);
      if (!dateObj) continue;
      const isPast = dateObj < today;
      if (isPast && !includePast) {
        console.log(JSON.stringify({ route: r, date, skipped: 'past_date' }));
        continue;
      }
      if (skipExisting && hasSnapshot(db, { origin: r.origin, destination: r.destination, date })) {
        console.log(JSON.stringify({ route: r, date, skipped: 'exists' }));
        continue;
      }

      try {
        const raw = await searchFlightOffers({
          token: tokenRes.access_token,
          origin: r.origin,
          destination: r.destination,
          date,
          adults: 1
        });
        const normalized = normalizeFlightOffers(raw);
        const snapshotId = hashSnapshot({ route: r, date, offers: normalized });
        insertFlightSnapshot(db, {
          id: snapshotId,
          origin: r.origin,
          destination: r.destination,
          date,
          offers: normalized
        });
        console.log(JSON.stringify({ route: r, date, offers: normalized.length, snapshotId }));
      } catch (err) {
        console.warn(JSON.stringify({ route: r, date, error: String(err?.message ?? err) }));
      }

      if (REQUEST_SLEEP_MS) {
        await sleep(REQUEST_SLEEP_MS);
      }
    }
  }

  db.close();
}

run().catch((err) => {
  console.error(`[tdp-jobs] backfill flights failed: ${String(err?.message ?? err)}`);
  process.exit(1);
});
