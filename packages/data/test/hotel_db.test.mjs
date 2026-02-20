import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';


test('insert and list hotel offers', async () => {
  const dbPath = path.join(os.tmpdir(), `tdp-hotels-${Date.now()}-${Math.random()}.sqlite`);
  process.env.TDP_DB_PATH = dbPath;

  const { openDbWithHotels, insertHotelOffer, listHotelOffers } = await import('../src/hotel_db.js');
  const db = openDbWithHotels();

  insertHotelOffer(db, {
    id: 'h1',
    city: 'URC',
    date: '2026-04-06',
    star_rating: 4,
    review_score: 4.3,
    nightly_price: 300,
    total_price: 1200
  });

  const rows = listHotelOffers(db, { city: 'URC', date: '2026-04-06' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'h1');

  db.close();
  fs.rmSync(dbPath, { force: true });
});
