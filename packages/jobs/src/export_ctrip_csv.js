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
      `SELECT date, min_price, currency, source, airline, flight_no, depart_time, arrive_time, stops, transfer_details,
              direct_min_price, direct_airline, direct_flight_no, direct_depart_time, direct_arrive_time, direct_stops
       FROM ctrip_price_observations
       WHERE origin=@origin AND destination=@destination
       ORDER BY date ASC`
    )
    .all({ origin, destination });
  db.close();

  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.date);
    const next = current
      ? { ...current }
      : {
          date: row.date,
          min_price: null,
          currency: row.currency ?? 'CNY',
          airline: '',
          flight_no: '',
          depart_time: '',
          arrive_time: '',
          stops: '',
          transfer_details: '',
          source: row.source ?? 'unknown',
          direct_min_price: null,
          direct_airline: '',
          direct_flight_no: '',
          direct_depart_time: '',
          direct_arrive_time: '',
          direct_stops: ''
        };

    if (Number.isFinite(row.min_price) && row.min_price >= floor) {
      const shouldReplace =
        !Number.isFinite(next.min_price) ||
        row.min_price < next.min_price ||
        (row.min_price === next.min_price && row.depart_time && !next.depart_time);
      if (shouldReplace) {
        next.min_price = row.min_price;
        next.airline = row.airline ?? '';
        next.flight_no = row.flight_no ?? '';
        next.depart_time = row.depart_time ?? '';
        next.arrive_time = row.arrive_time ?? '';
        next.stops = Number.isFinite(row.stops) ? row.stops : '';
        next.transfer_details = row.transfer_details ?? '';
        next.source = row.source ?? next.source;
        next.currency = row.currency ?? next.currency;
      }
    }

    if (Number.isFinite(row.direct_min_price) && row.direct_min_price >= floor) {
      const shouldReplaceDirect =
        !Number.isFinite(next.direct_min_price) ||
        row.direct_min_price < next.direct_min_price ||
        (row.direct_min_price === next.direct_min_price && row.direct_depart_time && !next.direct_depart_time);
      if (shouldReplaceDirect) {
        next.direct_min_price = row.direct_min_price;
        next.direct_airline = row.direct_airline ?? '';
        next.direct_flight_no = row.direct_flight_no ?? '';
        next.direct_depart_time = row.direct_depart_time ?? '';
        next.direct_arrive_time = row.direct_arrive_time ?? '';
        next.direct_stops = Number.isFinite(row.direct_stops) ? row.direct_stops : '';
        next.currency = row.currency ?? next.currency;
      }
    }

    grouped.set(row.date, next);
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
  lines.push(
    [
      'date',
      'min_price',
      'currency',
      'airline',
      'flight_no',
      'depart_time',
      'arrive_time',
      'stops',
      'transfer_details',
      'source',
      'direct_min_price',
      'direct_airline',
      'direct_flight_no',
      'direct_depart_time',
      'direct_arrive_time',
      'direct_stops'
    ].join(',')
  );
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
        csvValue(row.transfer_details),
        csvValue(row.source),
        csvValue(row.direct_min_price),
        csvValue(row.direct_airline),
        csvValue(row.direct_flight_no),
        csvValue(row.direct_depart_time),
        csvValue(row.direct_arrive_time),
        csvValue(row.direct_stops)
      ].join(',')
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(JSON.stringify({ outPath, rows: lines.length - 1 }));
}

main();
