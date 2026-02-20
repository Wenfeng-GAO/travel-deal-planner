import { openDb } from './db.js';

export function ensureHotelSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotel_offers (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      date TEXT NOT NULL,
      star_rating REAL NOT NULL,
      review_score REAL NOT NULL,
      nightly_price REAL NOT NULL,
      total_price REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

export function insertHotelOffer(db, offer) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO hotel_offers(
      id, city, date, star_rating, review_score, nightly_price, total_price, created_at
    ) VALUES (
      @id, @city, @date, @star_rating, @review_score, @nightly_price, @total_price, @created_at
    )
  `);

  stmt.run({
    ...offer,
    created_at: Date.now()
  });
}

export function listHotelOffers(db, { city, date }) {
  const stmt = db.prepare(`
    SELECT id, city, date, star_rating, review_score, nightly_price, total_price
    FROM hotel_offers
    WHERE city = COALESCE(@city, city)
      AND date = COALESCE(@date, date)
    ORDER BY date ASC
  `);
  return stmt.all({ city: city ?? null, date: date ?? null });
}

export function openDbWithHotels() {
  const db = openDb();
  ensureHotelSchema(db);
  return db;
}
