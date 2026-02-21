import { loadEnv, getAmadeusToken, searchFlightOffers, normalizeFlightOffers, hashSnapshot } from '../../data/src/index.js';
import { openDb, insertFlightSnapshot } from '../../data/src/db.js';
import { ROUTES, FETCH_DAYS, REQUEST_SLEEP_MS } from '../../data/src/config.js';

loadEnv();

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function nextNDates(n) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const db = openDb();
  const clientId = getEnv('AMADEUS_CLIENT_ID');
  const clientSecret = getEnv('AMADEUS_CLIENT_SECRET');
  const tokenRes = await getAmadeusToken({ clientId, clientSecret });

  const dates = nextNDates(FETCH_DAYS);

  for (const r of ROUTES) {
    for (const date of dates) {
      const raw = await searchFlightOffers({
        token: tokenRes.access_token,
        origin: r.origin,
        destination: r.destination,
        date
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
      await sleep(REQUEST_SLEEP_MS);
    }
  }

  db.close();
}

run().catch((err) => {
  console.error(`[tdp-jobs] daily fetch failed: ${String(err?.message ?? err)}`);
  process.exit(1);
});
