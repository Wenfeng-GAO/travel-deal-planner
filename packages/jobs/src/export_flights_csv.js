import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../data/src/db.js';

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

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return '';
  return Math.round(value * 100) / 100;
}

function exportCsv({ origin, destination, outPath }) {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT date, offers_json FROM flight_snapshots WHERE origin=@origin AND destination=@destination ORDER BY date ASC`
    )
    .all({ origin, destination });
  db.close();

  const lines = [];
  lines.push(['date', 'min_price', 'p10', 'p50', 'p90', 'offer_count'].join(','));

  for (const row of rows) {
    const offers = JSON.parse(row.offers_json || '[]');
    const prices = offers.map((o) => o.price).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!prices.length) continue;
    const min = prices[0];
    const p10 = percentile(prices, 0.1);
    const p50 = percentile(prices, 0.5);
    const p90 = percentile(prices, 0.9);
    lines.push([
      row.date,
      formatNumber(min),
      formatNumber(p10),
      formatNumber(p50),
      formatNumber(p90),
      prices.length
    ].join(','));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  return { outPath, rows: lines.length - 1 };
}

function main() {
  const args = parseArgs(process.argv);
  const origin = (args.origin ?? 'PVG').toUpperCase();
  const destination = (args.destination ?? 'URC').toUpperCase();
  const outPath = args.out ?? path.join(process.cwd(), 'storage', `flight_prices_${origin}_${destination}.csv`);
  const result = exportCsv({ origin, destination, outPath });
  console.log(JSON.stringify(result));
}

main();
