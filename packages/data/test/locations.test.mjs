import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeIataCode, ensureIataCode } from '../src/locations.js';

test('normalizeIataCode maps city names to IATA', () => {
  assert.equal(normalizeIataCode('上海'), 'PVG');
  assert.equal(normalizeIataCode('乌鲁木齐'), 'URC');
  assert.equal(normalizeIataCode('DLU'), 'DLU');
});

test('ensureIataCode rejects unsupported input', () => {
  assert.throws(() => ensureIataCode('NOT_A_CITY'), /IATA/);
});
