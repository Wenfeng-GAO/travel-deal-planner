import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommendFromAmadeus, recommendFromSample, listSnapshotsForApi, recommendFromSnapshots } from './recommendations.js';

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
    source = 'snapshots',
    trip_length_days,
    tripLengthDays
  } = req.query;
  const tripDaysRaw = trip_length_days ?? tripLengthDays;
  const tripDays = tripDaysRaw ? Number(tripDaysRaw) : undefined;

  try {
    if (source === 'amadeus' && !date) {
      return res.status(400).json({ error: 'date is required when source=amadeus' });
    }
    const rec = source === 'sample'
      ? recommendFromSample({ tripLengthDays: tripDays })
      : source === 'snapshots'
        ? recommendFromSnapshots({ origin, destination, tripLengthDays: tripDays })
        : await recommendFromAmadeus({ origin, destination, date, tripLengthDays: tripDays });

    res.json({
      ...rec,
      confidence: source === 'sample' ? 'stub' : 'low',
      note: source === 'sample'
        ? 'sample data'
        : source === 'snapshots'
          ? 'snapshot-based (flights only)'
          : 'amadeus flights only'
    });
  } catch (err) {
    res.status(500).json({
      error: String(err?.message ?? err),
      hint: 'set AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET or use ?source=sample'
    });
  }
});

app.get('/snapshots', (req, res) => {
  const { origin = null, destination = null } = req.query;
  res.json({ rows: listSnapshotsForApi({ origin, destination }) });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`[tdp-api] listening on :${port}`);
});
