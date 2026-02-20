import fs from 'node:fs';
import path from 'node:path';

const baseDir = process.env.TDP_STORAGE_DIR || path.join(process.cwd(), 'storage');
const flightsDir = path.join(baseDir, 'flights');

function ensureDirs() {
  fs.mkdirSync(flightsDir, { recursive: true });
}

export function writeFlightSnapshot({ route, date, snapshotId, offers }) {
  ensureDirs();
  const key = `${route.origin}-${route.destination}-${date}-${snapshotId}`;
  const outPath = path.join(flightsDir, `${key}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ route, date, snapshotId, offers }, null, 2));
  return outPath;
}

export function listFlightSnapshots() {
  ensureDirs();
  return fs.readdirSync(flightsDir).map((f) => path.join(flightsDir, f));
}
