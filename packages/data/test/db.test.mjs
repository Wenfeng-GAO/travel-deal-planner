import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';


test('insert and list snapshots', async () => {
  const dbPath = path.join(os.tmpdir(), `tdp-${Date.now()}-${Math.random()}.sqlite`);
  process.env.TDP_DB_PATH = dbPath;

  const { openDb, insertFlightSnapshot, listSnapshots } = await import('../src/db.js');
  const db = openDb();

  insertFlightSnapshot(db, {
    id: 's1',
    origin: 'PVG',
    destination: 'URC',
    date: '2026-04-01',
    offers: [{ price: 1000 }]
  });

  const rows = listSnapshots(db, { origin: 'PVG', destination: 'URC' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 's1');

  db.close();
  fs.rmSync(dbPath, { force: true });
});
