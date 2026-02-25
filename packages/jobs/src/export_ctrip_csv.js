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

function main() {
  const args = parseArgs(process.argv);
  const origin = (args.origin ?? 'PVG').toUpperCase();
  const destination = (args.destination ?? 'URC').toUpperCase();
  const floor = args['min-price-floor'] ? Number(args['min-price-floor']) : 300;
  const outPath = args.out ?? path.join(process.cwd(), 'storage', `ctrip_prices_${origin}_${destination}.csv`);

  const db = openDb();
  const rows = db
    .prepare(
      `SELECT date, min_price, currency, source, airline, flight_no, depart_time, arrive_time, stops
       FROM ctrip_price_observations
       WHERE origin=@origin AND destination=@destination
       ORDER BY date ASC`
    )
    .all({ origin, destination });
  db.close();

  const pickBetter = (current, candidate) => {
    if (!current) return candidate;
    if (candidate.min_price < current.min_price) return candidate;
    if (candidate.min_price > current.min_price) return current;
    const currentHasFlight = Boolean(current.flight_no || current.depart_time || current.arrive_time);
    const candidateHasFlight = Boolean(candidate.flight_no || candidate.depart_time || candidate.arrive_time);
    if (candidateHasFlight && !currentHasFlight) return candidate;
    if (currentHasFlight && !candidateHasFlight) return current;
    if (candidate.depart_time && current.depart_time) {
      return candidate.depart_time < current.depart_time ? candidate : current;
    }
    if (candidate.depart_time && !current.depart_time) return candidate;
    if (current.depart_time && !candidate.depart_time) return current;
    return current;
  };

  const grouped = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.min_price)) continue;
    if (row.min_price < floor) continue;
    const current = grouped.get(row.date);
    const normalized = {
      date: row.date,
      min_price: row.min_price,
      currency: row.currency ?? 'CNY',
      airline: row.airline ?? '',
      flight_no: row.flight_no ?? '',
      depart_time: row.depart_time ?? '',
      arrive_time: row.arrive_time ?? '',
      stops: Number.isFinite(row.stops) ? row.stops : '',
      source: row.source ?? 'unknown'
    };
    grouped.set(row.date, pickBetter(current, normalized));
  }

  const csvValue = (value) => {
    if (value == null) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [];
  lines.push(['date', 'min_price', 'currency', 'airline', 'flight_no', 'depart_time', 'arrive_time', 'stops', 'source'].join(','));
  for (const row of Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(
      [
        csvValue(row.date),
        csvValue(row.min_price),
        csvValue(row.currency),
        csvValue(row.airline),
        csvValue(row.flight_no),
        csvValue(row.depart_time),
        csvValue(row.arrive_time),
        csvValue(row.stops),
        csvValue(row.source)
      ].join(',')
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(JSON.stringify({ outPath, rows: lines.length - 1 }));
}

main();
