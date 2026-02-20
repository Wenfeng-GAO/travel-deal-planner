import crypto from 'node:crypto';

const AMADEUS_BASE = 'https://test.api.amadeus.com';

function encodeForm(data) {
  return new URLSearchParams(data).toString();
}

export async function getAmadeusToken({ clientId, clientSecret }) {
  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: encodeForm({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`amadeus token failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function searchFlightOffers({ token, origin, destination, date, adults = 1 }) {
  const qs = new URLSearchParams({
    originLocationCode: origin,
    destinationLocationCode: destination,
    departureDate: date,
    adults: String(adults),
    currencyCode: 'CNY',
    max: '50'
  }).toString();

  const res = await fetch(`${AMADEUS_BASE}/v2/shopping/flight-offers?${qs}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`amadeus offers failed: ${res.status} ${body}`);

  const json = JSON.parse(body);
  return json;
}

export async function listHotelsByCity({
  token,
  cityCode,
  radius = 20,
  radiusUnit = 'KM',
  hotelSource = 'ALL'
}) {
  const qs = new URLSearchParams({
    cityCode,
    radius: String(radius),
    radiusUnit,
    hotelSource
  }).toString();

  const res = await fetch(`${AMADEUS_BASE}/v1/reference-data/locations/hotels/by-city?${qs}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`amadeus hotels by city failed: ${res.status} ${body}`);
  return JSON.parse(body);
}

export async function searchHotelOffers({
  token,
  hotelIds,
  checkInDate,
  checkOutDate,
  adults = 1,
  currency = 'CNY'
}) {
  const qs = new URLSearchParams({
    hotelIds: Array.isArray(hotelIds) ? hotelIds.join(',') : String(hotelIds),
    checkInDate,
    checkOutDate,
    adults: String(adults),
    currency
  }).toString();

  const res = await fetch(`${AMADEUS_BASE}/v3/shopping/hotel-offers?${qs}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`amadeus hotel offers failed: ${res.status} ${body}`);
  return JSON.parse(body);
}

export async function getHotelSentiments({ token, hotelIds }) {
  const qs = new URLSearchParams({
    hotelIds: Array.isArray(hotelIds) ? hotelIds.join(',') : String(hotelIds)
  }).toString();
  const res = await fetch(`${AMADEUS_BASE}/v2/e-reputation/hotel-sentiments?${qs}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`amadeus hotel sentiments failed: ${res.status} ${body}`);
  return JSON.parse(body);
}

export function hashSnapshot(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
