import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEnv } from '../src/env.js';
import { getAmadeusToken, searchFlightOffers, listHotelsByCity } from '../src/amadeus.js';

loadEnv();

const clientId = process.env.AMADEUS_CLIENT_ID;
const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
const hasCreds = Boolean(clientId && clientSecret);

const it = hasCreds ? test : test.skip;

function futureDate(offsetDays = 30) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

it('amadeus token + flight offers succeed', async () => {
  const tokenRes = await getAmadeusToken({ clientId, clientSecret });
  assert.ok(tokenRes?.access_token);

  const raw = await searchFlightOffers({
    token: tokenRes.access_token,
    origin: 'PAR',
    destination: 'LON',
    date: futureDate(35),
    adults: 1
  });
  assert.ok(raw);
  assert.ok(Array.isArray(raw.data));
});

it('amadeus hotels by city returns data array', async () => {
  const tokenRes = await getAmadeusToken({ clientId, clientSecret });
  const raw = await listHotelsByCity({
    token: tokenRes.access_token,
    cityCode: 'PAR',
    radius: 10,
    radiusUnit: 'KM',
    hotelSource: 'ALL'
  });
  assert.ok(raw);
  assert.ok(Array.isArray(raw.data));
});
