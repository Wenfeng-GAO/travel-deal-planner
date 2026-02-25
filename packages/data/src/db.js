import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.TDP_DB_PATH || path.join(process.cwd(), 'storage', 'tdp.sqlite');

export function openDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS flight_snapshots (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      offers_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ctrip_price_observations (
      id TEXT PRIMARY KEY,
      ota TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      min_price REAL NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      captured_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ctrip_raw_snapshots (
      id TEXT PRIMARY KEY,
      ota TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      raw_path TEXT NOT NULL,
      captured_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ctrip_crawler_errors (
      id TEXT PRIMARY KEY,
      ota TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      error_type TEXT NOT NULL,
      error_message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return db;
}

export function insertFlightSnapshot(db, { id, origin, destination, date, offers }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO flight_snapshots(id, origin, destination, date, offers_json, created_at)
    VALUES (@id, @origin, @destination, @date, @offers_json, @created_at)
  `);

  stmt.run({
    id,
    origin,
    destination,
    date,
    offers_json: JSON.stringify(offers),
    created_at: Date.now()
  });
}

export function listSnapshots(db, { origin, destination }) {
  const stmt = db.prepare(`
    SELECT id, origin, destination, date, offers_json
    FROM flight_snapshots
    WHERE origin = COALESCE(@origin, origin)
      AND destination = COALESCE(@destination, destination)
    ORDER BY date ASC
  `);
  return stmt.all({ origin: origin ?? null, destination: destination ?? null });
}

export function hasSnapshot(db, { origin, destination, date }) {
  const stmt = db.prepare(`
    SELECT 1
    FROM flight_snapshots
    WHERE origin = @origin
      AND destination = @destination
      AND date = @date
    LIMIT 1
  `);
  return Boolean(stmt.get({ origin, destination, date }));
}

export function hasCtripPrice(db, { origin, destination, date }) {
  const stmt = db.prepare(`
    SELECT 1
    FROM ctrip_price_observations
    WHERE origin = @origin
      AND destination = @destination
      AND date = @date
    LIMIT 1
  `);
  return Boolean(stmt.get({ origin, destination, date }));
}

export function insertCtripPrice(db, { id, ota, origin, destination, date, min_price, currency, source }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ctrip_price_observations
      (id, ota, origin, destination, date, min_price, currency, source, captured_at)
    VALUES
      (@id, @ota, @origin, @destination, @date, @min_price, @currency, @source, @captured_at)
  `);
  stmt.run({
    id,
    ota,
    origin,
    destination,
    date,
    min_price,
    currency,
    source,
    captured_at: Date.now()
  });
}

export function insertCtripRaw(db, { id, ota, origin, destination, date, raw_path }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ctrip_raw_snapshots
      (id, ota, origin, destination, date, raw_path, captured_at)
    VALUES
      (@id, @ota, @origin, @destination, @date, @raw_path, @captured_at)
  `);
  stmt.run({
    id,
    ota,
    origin,
    destination,
    date,
    raw_path,
    captured_at: Date.now()
  });
}

export function insertCtripError(db, { id, ota, origin, destination, date, error_type, error_message }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ctrip_crawler_errors
      (id, ota, origin, destination, date, error_type, error_message, created_at)
    VALUES
      (@id, @ota, @origin, @destination, @date, @error_type, @error_message, @created_at)
  `);
  stmt.run({
    id,
    ota,
    origin,
    destination,
    date,
    error_type,
    error_message,
    created_at: Date.now()
  });
}

export function listCtripPrices(db, { origin, destination }) {
  const stmt = db.prepare(`
    SELECT date, min_price, currency, source, captured_at
    FROM ctrip_price_observations
    WHERE origin = COALESCE(@origin, origin)
      AND destination = COALESCE(@destination, destination)
    ORDER BY date ASC
  `);
  return stmt.all({ origin: origin ?? null, destination: destination ?? null });
}

export function listCtripErrors(db, { origin, destination }) {
  const stmt = db.prepare(`
    SELECT date, error_type, error_message, created_at
    FROM ctrip_crawler_errors
    WHERE origin = COALESCE(@origin, origin)
      AND destination = COALESCE(@destination, destination)
    ORDER BY date ASC
  `);
  return stmt.all({ origin: origin ?? null, destination: destination ?? null });
}
