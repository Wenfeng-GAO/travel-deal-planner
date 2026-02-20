import fs from 'node:fs';

export function readSnapshot(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

export function mergeSnapshots(files) {
  const flights = [];
  const priceSeries = [];

  for (const f of files) {
    const s = readSnapshot(f);
    const offers = s.offers || [];
    for (const o of offers) {
      flights.push(o);
      priceSeries.push({ date: s.date, price: o.price });
    }
  }

  return { flights, priceSeries };
}
