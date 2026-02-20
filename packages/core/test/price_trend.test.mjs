import test from 'node:test';
import assert from 'node:assert/strict';

import { computePriceTrend } from '../src/price_trend.js';

test('computePriceTrend detects falling trend', () => {
  const series = [
    { date: '2026-01-01', price: 1200 },
    { date: '2026-01-02', price: 1150 },
    { date: '2026-01-03', price: 1100 },
    { date: '2026-01-04', price: 1000 }
  ];
  const trend = computePriceTrend(series);
  assert.ok(trend);
  assert.equal(trend.trend, 'falling');
});
