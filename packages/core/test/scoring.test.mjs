import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreLowestPlan, scoreComfortPlan, attachDelta, buildRecommendation } from '../src/scoring.js';

const flights = [
  { price: 1000, layovers: 0 },
  { price: 800, layovers: 2 }
];

const hotels = [
  { total_price: 1500, star_rating: 4, review_score: 4.2 },
  { total_price: 900, star_rating: 2, review_score: 3.5 }
];

test('scoreLowestPlan uses comfort hotel filter', () => {
  const r = scoreLowestPlan({ flights, hotels });
  assert.ok(r);
  assert.equal(r.hotel.star_rating, 4);
  assert.equal(r.total_price, 800 + 1500);
});

test('scoreComfortPlan enforces max layovers', () => {
  const r = scoreComfortPlan({ flights, hotels });
  assert.ok(r);
  assert.equal(r.flight.layovers, 0);
});

test('attachDelta computes delta', () => {
  const lowest = { total_price: 2000 };
  const comfort = { total_price: 2300 };
  const r = attachDelta(lowest, comfort);
  assert.equal(r.delta_vs_lowest, 300);
});

test('buildRecommendation includes booking and travel windows', () => {
  const priceSeries = [
    { date: '2026-04-01', price: 100 },
    { date: '2026-04-01', price: 120 },
    { date: '2026-04-02', price: 200 },
    { date: '2026-04-03', price: 90 },
    { date: '2026-04-04', price: 80 },
    { date: '2026-04-05', price: 300 }
  ];
  const r = buildRecommendation({ flights, hotels, priceSeries, tripLengthDays: 3 });
  assert.ok(r.booking_window);
  assert.equal(r.trip_length_days, 3);
  assert.ok(r.travel_window);
  assert.equal(r.travel_window.start_date, '2026-04-02');
  assert.equal(r.travel_window.end_date, '2026-04-04');
  assert.equal(r.travel_window_basis, 'flight_only');
  assert.ok(r.price_trend);
  assert.ok(r.hotel_price_range);
  assert.ok(r.comfort_hotels.length > 0);
  assert.ok(r.price_series_summary);
  assert.ok(r.explanations.length > 0);
});

test('summarizeTripCost combines flight and hotel by date', () => {
  const priceSeries = [
    { date: '2026-04-01', price: 100 },
    { date: '2026-04-02', price: 200 }
  ];
  const hotelsByDate = [
    { total_price: 500, star_rating: 4, review_score: 4.2, date: '2026-04-01' },
    { total_price: 300, star_rating: 4, review_score: 4.2, date: '2026-04-02' }
  ];
  const r = buildRecommendation({ flights, hotels: hotelsByDate, priceSeries, tripLengthDays: 3 });
  assert.ok(r.trip_cost_summary);
  assert.equal(r.trip_cost_summary.best_date, '2026-04-02');
});
