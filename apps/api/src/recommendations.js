import { buildRecommendation } from '../../../packages/core/src/index.js';
import { getAmadeusToken, searchFlightOffers, normalizeFlightOffers, REQUEST_SLEEP_MS } from '../../../packages/data/src/index.js';
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

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function futureDate(offsetDays = 30) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function recommendFromAmadeusRange(params) {
  const clientId = getEnv('AMADEUS_CLIENT_ID');
  const clientSecret = getEnv('AMADEUS_CLIENT_SECRET');
  const tokenRes = await getAmadeusToken({ clientId, clientSecret });

  const days = params.rangeDays ?? 14;
  const start = params.startDate ?? params.date ?? futureDate(30);

  const flights = [];
  const priceSeries = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const raw = await searchFlightOffers({
      token: tokenRes.access_token,
      origin: params.origin,
      destination: params.destination,
      date,
      adults: params.adults ?? 1
    });
    const normalized = normalizeFlightOffers(raw);
    for (const f of normalized) {
      flights.push(f);
      priceSeries.push({ date, price: f.price });
    }
    if (REQUEST_SLEEP_MS) {
      await sleep(REQUEST_SLEEP_MS);
    }
  }

  const hotels = [];
  return buildRecommendation({ flights, hotels, priceSeries, tripLengthDays: params.tripLengthDays });
}

export function listSnapshotsForApi({ origin, destination }) {
  const db = openDb();
  const rows = listSnapshots(db, { origin, destination });
  db.close();
  return rows;
}

export function recommendFromSnapshots({ origin, destination, tripLengthDays, flightOnly }) {
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

  let hotels = [];
  if (!flightOnly) {
    const hdb = openDbWithHotels();
    hotels = listHotelOffers(hdb, { city: destination ?? null, date: null });
    hdb.close();
  }
  return buildRecommendation({ flights, hotels, priceSeries, tripLengthDays });
}

export function recommendFromSample({ tripLengthDays } = {}) {
  const flights = [
    {
      price: 1200,
      currency: 'CNY',
      layovers: 0,
      depart_time: '2026-04-06T10:30',
      arrive_time: '2026-04-06T15:10',
      segments: [
        { from: 'PVG', to: 'URC', depart_at: '2026-04-06T10:30', arrive_at: '2026-04-06T15:10', carrier: 'MU' }
      ]
    },
    {
      price: 900,
      currency: 'CNY',
      layovers: 2,
      depart_time: '2026-04-06T06:10',
      arrive_time: '2026-04-06T18:40',
      segments: [
        { from: 'PVG', to: 'XIY', depart_at: '2026-04-06T06:10', arrive_at: '2026-04-06T09:30', carrier: 'CZ' },
        { from: 'XIY', to: 'URC', depart_at: '2026-04-06T11:00', arrive_at: '2026-04-06T18:40', carrier: 'CZ' }
      ]
    }
  ];
  const hotels = [
    {
      hotel_id: 'URC_001',
      hotel_name: '乌鲁木齐天山行旅酒店',
      total_price: 1400,
      nightly_price: 350,
      star_rating: 4,
      review_score: 4.2,
      date: '2026-02-01',
      check_in: '2026-02-01',
      check_out: '2026-02-05'
    },
    {
      hotel_id: 'URC_002',
      hotel_name: '乌鲁木齐南湖雅致酒店',
      total_price: 1300,
      nightly_price: 325,
      star_rating: 4,
      review_score: 4.1,
      date: '2026-02-10',
      check_in: '2026-02-10',
      check_out: '2026-02-14'
    },
    {
      hotel_id: 'URC_003',
      hotel_name: '乌鲁木齐丝路国际酒店',
      total_price: 1500,
      nightly_price: 375,
      star_rating: 5,
      review_score: 4.6,
      date: '2026-02-20',
      check_in: '2026-02-20',
      check_out: '2026-02-24'
    },
    {
      hotel_id: 'URC_004',
      hotel_name: '乌鲁木齐机场云宿酒店',
      total_price: 1200,
      nightly_price: 300,
      star_rating: 4,
      review_score: 4.3,
      date: '2026-03-01',
      check_in: '2026-03-01',
      check_out: '2026-03-05'
    }
  ];
  const priceSeries = [
    { date: '2026-02-01', price: 1100 },
    { date: '2026-02-10', price: 1000 },
    { date: '2026-02-20', price: 1200 },
    { date: '2026-03-01', price: 900 }
  ];
  return buildRecommendation({ flights, hotels, priceSeries, tripLengthDays });
}
