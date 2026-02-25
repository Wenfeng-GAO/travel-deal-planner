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
      `SELECT date, min_price, currency, source FROM ctrip_price_observations
       WHERE origin=@origin AND destination=@destination
       ORDER BY date ASC`
    )
    .all({ origin, destination });
  db.close();

  const grouped = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.min_price)) continue;
    if (row.min_price < floor) continue;
    const current = grouped.get(row.date);
    if (!current || row.min_price < current.min_price) {
      grouped.set(row.date, {
        date: row.date,
        min_price: row.min_price,
        currency: row.currency ?? 'CNY',
        source: row.source ?? 'unknown'
      });
    }
  }

  const lines = [];
  lines.push(['date', 'min_price', 'currency', 'source'].join(','));
  for (const row of Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([row.date, row.min_price, row.currency, row.source].join(','));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(JSON.stringify({ outPath, rows: lines.length - 1 }));
}

main();
