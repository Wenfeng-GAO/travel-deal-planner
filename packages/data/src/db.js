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
      airline TEXT,
      flight_no TEXT,
      depart_time TEXT,
      arrive_time TEXT,
      stops INTEGER,
      transfer_details TEXT,
      direct_min_price REAL,
      direct_airline TEXT,
      direct_flight_no TEXT,
      direct_depart_time TEXT,
      direct_arrive_time TEXT,
      direct_stops INTEGER,
      captured_at INTEGER NOT NULL
    );
  `);

  const columns = db.prepare(`PRAGMA table_info(ctrip_price_observations)`).all();
  const columnNames = new Set(columns.map((c) => c.name));
  const ensureColumn = (name, type) => {
    if (!columnNames.has(name)) {
      db.exec(`ALTER TABLE ctrip_price_observations ADD COLUMN ${name} ${type}`);
      columnNames.add(name);
    }
  };
  ensureColumn('airline', 'TEXT');
  ensureColumn('flight_no', 'TEXT');
  ensureColumn('depart_time', 'TEXT');
  ensureColumn('arrive_time', 'TEXT');
  ensureColumn('stops', 'INTEGER');
  ensureColumn('transfer_details', 'TEXT');
  ensureColumn('direct_min_price', 'REAL');
  ensureColumn('direct_airline', 'TEXT');
  ensureColumn('direct_flight_no', 'TEXT');
  ensureColumn('direct_depart_time', 'TEXT');
  ensureColumn('direct_arrive_time', 'TEXT');
  ensureColumn('direct_stops', 'INTEGER');

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

export function insertCtripPrice(
  db,
  {
    id,
    ota,
    origin,
    destination,
    date,
    min_price,
    currency,
    source,
    airline,
    flight_no,
    depart_time,
    arrive_time,
    stops,
    transfer_details,
    direct_min_price,
    direct_airline,
    direct_flight_no,
    direct_depart_time,
    direct_arrive_time,
    direct_stops
  }
) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ctrip_price_observations
      (id, ota, origin, destination, date, min_price, currency, source, airline, flight_no, depart_time, arrive_time, stops, transfer_details, direct_min_price, direct_airline, direct_flight_no, direct_depart_time, direct_arrive_time, direct_stops, captured_at)
    VALUES
      (@id, @ota, @origin, @destination, @date, @min_price, @currency, @source, @airline, @flight_no, @depart_time, @arrive_time, @stops, @transfer_details, @direct_min_price, @direct_airline, @direct_flight_no, @direct_depart_time, @direct_arrive_time, @direct_stops, @captured_at)
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
    airline: airline ?? null,
    flight_no: flight_no ?? null,
    depart_time: depart_time ?? null,
    arrive_time: arrive_time ?? null,
    stops: Number.isFinite(stops) ? stops : null,
    transfer_details: transfer_details ?? null,
    direct_min_price: Number.isFinite(direct_min_price) ? direct_min_price : null,
    direct_airline: direct_airline ?? null,
    direct_flight_no: direct_flight_no ?? null,
    direct_depart_time: direct_depart_time ?? null,
    direct_arrive_time: direct_arrive_time ?? null,
    direct_stops: Number.isFinite(direct_stops) ? direct_stops : null,
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
    SELECT date, min_price, currency, source, airline, flight_no, depart_time, arrive_time, stops, transfer_details,
           direct_min_price, direct_airline, direct_flight_no, direct_depart_time, direct_arrive_time, direct_stops, captured_at
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
