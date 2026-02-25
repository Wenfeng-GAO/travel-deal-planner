import fs from 'node:fs';
import path from 'node:path';
import { openDb, listCtripPrices } from '../../data/src/db.js';

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

function pickRandom(array, count) {
  const copy = [...array];
  const out = [];
  while (copy.length && out.length < count) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function buildUrl(origin, destination, date) {
  return `https://flights.ctrip.com/online/list/oneway-${origin.toLowerCase()}-${destination.toLowerCase()}?depdate=${date}&cabin=y_s&adult=1&child=0&infant=0`;
}

function main() {
  const args = parseArgs(process.argv);
  const origin = (args.origin ?? 'PVG').toUpperCase();
  const destination = (args.destination ?? 'URC').toUpperCase();
  const count = args.count ? Number(args.count) : 3;
  const outPath = args.out ?? path.join(process.cwd(), 'storage', `ctrip_spotcheck_${origin}_${destination}.csv`);

  const db = openDb();
  const rows = listCtripPrices(db, { origin, destination });
  db.close();

  const selected = pickRandom(rows, count);
  const lines = ['date,min_price,source,ctrip_url,checked_price,checked_at,notes'];
  for (const row of selected) {
    lines.push([
      row.date,
      row.min_price,
      row.source ?? 'unknown',
      buildUrl(origin, destination, row.date),
      '',
      '',
      ''
    ].join(','));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(JSON.stringify({ outPath, rows: selected.length }));
}

main();
