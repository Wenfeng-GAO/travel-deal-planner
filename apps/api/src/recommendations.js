import { buildRecommendation } from '../../../packages/core/src/index.js';
import { getAmadeusToken, searchFlightOffers, normalizeFlightOffers } from '../../../packages/data/src/index.js';
import { openDb, listSnapshots } from '../../../packages/data/src/db.js';
import { openDbWithHotels, listHotelOffers } from '../../../packages/data/src/hotel_db.js';

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export async function recommendFromAmadeus(params) {
  const clientId = getEnv('AMADEUS_CLIENT_ID');
  const clientSecret = getEnv('AMADEUS_CLIENT_SECRET');
  const tokenRes = await getAmadeusToken({ clientId, clientSecret });

  const raw = await searchFlightOffers({
    token: tokenRes.access_token,
    origin: params.origin,
    destination: params.destination,
    date: params.date,
    adults: params.adults ?? 1
  });

  const flights = normalizeFlightOffers(raw);

  // Hotels are still pending; inject empty for now.
  const hotels = [];
  const priceSeries = flights.map((f) => ({ date: params.date, price: f.price }));

  return buildRecommendation({ flights, hotels, priceSeries, tripLengthDays: params.tripLengthDays });
}

export function listSnapshotsForApi({ origin, destination }) {
  const db = openDb();
  const rows = listSnapshots(db, { origin, destination });
  db.close();
  return rows;
}

export function recommendFromSnapshots({ origin, destination, tripLengthDays }) {
  const db = openDb();
  const rows = listSnapshots(db, { origin, destination });
  db.close();

  const flights = [];
  const priceSeries = [];

  for (const r of rows) {
    const offers = JSON.parse(r.offers_json || '[]');
    for (const o of offers) {
      flights.push(o);
      priceSeries.push({ date: r.date, price: o.price });
    }
  }

  const hdb = openDbWithHotels();
  const hotels = listHotelOffers(hdb, { city: destination ?? null, date: null });
  hdb.close();
  return buildRecommendation({ flights, hotels, priceSeries, tripLengthDays });
}

export function recommendFromSample({ tripLengthDays } = {}) {
  const flights = [
    { price: 1200, currency: 'CNY', layovers: 0, depart_time: '2026-04-06T10:30', arrive_time: '2026-04-06T15:10', segments: [] },
    { price: 900, currency: 'CNY', layovers: 2, depart_time: '2026-04-06T06:10', arrive_time: '2026-04-06T18:40', segments: [] }
  ];
  const hotels = [
    { total_price: 1400, nightly_price: 350, star_rating: 4, review_score: 4.2, date: '2026-02-01' },
    { total_price: 1300, nightly_price: 325, star_rating: 4, review_score: 4.1, date: '2026-02-10' },
    { total_price: 1500, nightly_price: 375, star_rating: 5, review_score: 4.6, date: '2026-02-20' },
    { total_price: 1200, nightly_price: 300, star_rating: 4, review_score: 4.3, date: '2026-03-01' }
  ];
  const priceSeries = [
    { date: '2026-02-01', price: 1100 },
    { date: '2026-02-10', price: 1000 },
    { date: '2026-02-20', price: 1200 },
    { date: '2026-03-01', price: 900 }
  ];
  return buildRecommendation({ flights, hotels, priceSeries, tripLengthDays });
}
