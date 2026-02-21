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

function computeDailyMin(rows) {
  const out = [];
  for (const row of rows) {
    const offers = JSON.parse(row.offers_json || '[]');
    if (!offers.length) continue;
    const min = offers.reduce((a, b) => (a.price <= b.price ? a : b));
    out.push({ date: row.date, price: min.price });
  }
  return out;
}

function buildSvg(series, { width = 900, height = 320 } = {}) {
  if (!series.length) {
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
  }
  const values = series.map((d) => d.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = series.map((d, i) => {
    const x = (i / (series.length - 1 || 1)) * width;
    const y = height - ((d.price - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff" />
      <polyline
        fill="none"
        stroke="#0f766e"
        stroke-width="3"
        points="${points.join(' ')}"
      />
    </svg>
  `;
}

function formatTitle({ origin, destination, start, end }) {
  return `${origin} → ${destination} · ${start} to ${end}`;
}

function writeHtml({ title, svg, outPath }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; background: #f6f1e7; color: #1f2430; padding: 24px; }
  .card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 12px 28px rgba(16,23,34,0.08); max-width: 980px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <div class="meta">Daily minimum flight price</div>
    ${svg}
  </div>
</body>
</html>`;
  fs.writeFileSync(outPath, html);
}

function main() {
  const args = parseArgs(process.argv);
  const origin = (args.origin ?? 'PVG').toUpperCase();
  const destination = (args.destination ?? 'URC').toUpperCase();
  const out = args.out ?? path.join(process.cwd(), 'storage', `chart_${origin}_${destination}.html`);

  const db = openDb();
  const rows = db
    .prepare(
      `SELECT date, offers_json FROM flight_snapshots WHERE origin=@origin AND destination=@destination ORDER BY date ASC`
    )
    .all({ origin, destination });
  db.close();

  const series = computeDailyMin(rows);
  const start = series[0]?.date ?? 'n/a';
  const end = series[series.length - 1]?.date ?? 'n/a';
  const title = formatTitle({ origin, destination, start, end });
  const svg = buildSvg(series);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeHtml({ title, svg, outPath: out });
  console.log(JSON.stringify({ out, points: series.length }));
}

main();
