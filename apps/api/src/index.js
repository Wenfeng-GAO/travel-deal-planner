import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommendFromAmadeus, recommendFromAmadeusRange, recommendFromSample, listSnapshotsForApi, recommendFromSnapshots } from './recommendations.js';
import { loadEnv } from '../../../packages/data/src/env.js';
import { ensureIataCode, normalizeIataCode, listSupportedCities } from '../../../packages/data/src/locations.js';

loadEnv();

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '../../web');
app.use(express.static(webDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tdp-api' });
});

app.get('/recommendations', async (req, res) => {
  const {
    origin = 'PVG',
    destination = 'URC',
    date,
    start_date,
    date_range_days,
    source = 'snapshots',
    flight_only,
    trip_length_days,
    tripLengthDays
  } = req.query;
  const tripDaysRaw = trip_length_days ?? tripLengthDays;
  const tripDays = tripDaysRaw ? Number(tripDaysRaw) : undefined;
  const flightOnly = String(flight_only ?? '').toLowerCase() === '1' || String(flight_only ?? '').toLowerCase() === 'true';
  const rangeDaysRaw = date_range_days ? Number(date_range_days) : undefined;
  const rangeDays = Number.isFinite(rangeDaysRaw) && rangeDaysRaw > 0 ? Math.floor(rangeDaysRaw) : undefined;

  try {
    const originCode = ensureIataCode(origin, 'origin');
    const destinationCode = ensureIataCode(destination, 'destination');
    const rec = source === 'sample'
      ? recommendFromSample({ tripLengthDays: tripDays })
      : source === 'snapshots'
        ? recommendFromSnapshots({ origin: originCode, destination: destinationCode, tripLengthDays: tripDays, flightOnly })
        : rangeDays || !date
          ? await recommendFromAmadeusRange({
              origin: originCode,
              destination: destinationCode,
              date,
              startDate: start_date,
              rangeDays,
              tripLengthDays: tripDays
            })
          : await recommendFromAmadeus({ origin: originCode, destination: destinationCode, date, tripLengthDays: tripDays });

    res.json({
      ...rec,
      confidence: source === 'sample' ? 'stub' : 'low',
      note: source === 'sample'
        ? 'sample data'
        : source === 'snapshots'
          ? 'snapshot-based (flights only)'
          : (rangeDays || !date)
            ? `amadeus flights only (range ${rangeDays ?? 14} days)`
            : 'amadeus flights only'
    });
  } catch (err) {
    if (String(err?.message ?? '').includes('IATA')) {
      return res.status(400).json({
        error: String(err?.message ?? err),
        supported_cities: listSupportedCities()
      });
    }
    res.status(500).json({
      error: String(err?.message ?? err),
      hint: 'set AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET or use ?source=sample'
    });
  }
});

app.get('/snapshots', (req, res) => {
  const { origin = null, destination = null } = req.query;
  const originCode = origin ? normalizeIataCode(origin) : null;
  const destinationCode = destination ? normalizeIataCode(destination) : null;
  res.json({ rows: listSnapshotsForApi({ origin: originCode ?? origin, destination: destinationCode ?? destination }) });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`[tdp-api] listening on :${port}`);
});
