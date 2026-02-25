import fs from 'node:fs';
import path from 'node:path';
import { openDb, listCtripPrices, listCtripErrors } from '../../data/src/db.js';

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

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
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

function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, 10);
}

function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  const origin = (args.origin ?? 'PVG').toUpperCase();
  const destination = (args.destination ?? 'URC').toUpperCase();
  const floor = args['min-price-floor'] ? Number(args['min-price-floor']) : 300;
  const startDate = normalizeDate(args['start-date'] ?? args.start_date);
  const endDate = normalizeDate(args['end-date'] ?? args.end_date);
  const outPath = args.out ?? path.join(process.cwd(), 'storage', `ctrip_quality_${origin}_${destination}.csv`);

  const db = openDb();
  const prices = listCtripPrices(db, { origin, destination });
  const errors = listCtripErrors(db, { origin, destination });
  db.close();

  const valid = prices
    .filter((p) => inRange(p.date, startDate, endDate))
    .filter((p) => Number.isFinite(p.min_price));
  const validDates = new Set(valid.map((p) => p.date));
  const rangeErrors = errors.filter((e) => inRange(e.date, startDate, endDate));
  const errorDays = new Set(rangeErrors.map((e) => e.date));
  const errorOnlyDays = Array.from(errorDays).filter((date) => !validDates.has(date));
  const values = valid.map((p) => p.min_price).sort((a, b) => a - b);
  const meanPrice = mean(values);
  const p10 = percentile(values, 0.1);
  const p50 = percentile(values, 0.5);
  const p90 = percentile(values, 0.9);

  const suspicious = valid.filter((p) => p.min_price < floor || p.min_price < meanPrice * 0.3);
  const errorCount = errorOnlyDays.length;
  const total = valid.length;
  const suspiciousRate = total ? (suspicious.length / total) : 0;

  const lines = [];
  lines.push(['origin', 'destination', 'total_days', 'error_count', 'suspicious_count', 'suspicious_rate', 'mean', 'p10', 'p50', 'p90'].join(','));
  lines.push([
    origin,
    destination,
    total,
    errorCount,
    suspicious.length,
    suspiciousRate.toFixed(4),
    meanPrice.toFixed(2),
    p10 ?? '',
    p50 ?? '',
    p90 ?? ''
  ].join(','));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));

  const samplePath = outPath.replace(/\.csv$/, '_suspicious.csv');
  const sampleLines = ['date,min_price,source'];
  for (const row of suspicious) {
    sampleLines.push([row.date, row.min_price, row.source ?? 'unknown'].join(','));
  }
  fs.writeFileSync(samplePath, sampleLines.join('\n'));

  console.log(JSON.stringify({ outPath, samplePath, total, errorCount, suspicious: suspicious.length }));
}

main();
