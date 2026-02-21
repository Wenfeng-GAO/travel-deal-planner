import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadEnv, resolveRepoRoot } from '../src/env.js';

test('loadEnv resolves repo root and loads .env from root', () => {
  const root = resolveRepoRoot();
  const envPath = path.join(root, '.env');
  assert.ok(fs.existsSync(path.join(root, 'package.json')));

  const original = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : null;
  const fixture = 'AMADEUS_CLIENT_ID="unit_test_id"\nAMADEUS_CLIENT_SECRET="unit_test_secret"\n';

  try {
    fs.writeFileSync(envPath, fixture);
    delete process.env.AMADEUS_CLIENT_ID;
    delete process.env.AMADEUS_CLIENT_SECRET;

    loadEnv({ override: true });

    assert.equal(process.env.AMADEUS_CLIENT_ID, 'unit_test_id');
    assert.equal(process.env.AMADEUS_CLIENT_SECRET, 'unit_test_secret');
  } finally {
    if (original === null) {
      fs.unlinkSync(envPath);
    } else {
      fs.writeFileSync(envPath, original);
    }
  }
});
