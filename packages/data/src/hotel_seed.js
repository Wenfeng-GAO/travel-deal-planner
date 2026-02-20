import { openDbWithHotels, insertHotelOffer } from './hotel_db.js';

const seed = [
  { id: 'URC-2026-04-06-1', city: 'URC', date: '2026-04-06', star_rating: 4, review_score: 4.2, nightly_price: 320, total_price: 1280 },
  { id: 'URC-2026-04-06-2', city: 'URC', date: '2026-04-06', star_rating: 3, review_score: 4.0, nightly_price: 260, total_price: 1040 },
  { id: 'CNX-2026-04-06-1', city: 'CNX', date: '2026-04-06', star_rating: 4, review_score: 4.5, nightly_price: 420, total_price: 1680 }
];

const db = openDbWithHotels();
for (const s of seed) insertHotelOffer(db, s);
console.log(`[tdp] seeded ${seed.length} hotel offers`);

db.close();
