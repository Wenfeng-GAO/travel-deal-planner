import {
  getAmadeusToken,
  listHotelsByCity,
  searchHotelOffers,
  getHotelSentiments,
  normalizeHotelOffers,
  buildHotelSentimentsMap
} from '../../data/src/index.js';
import { openDbWithHotels, insertHotelOffer } from '../../data/src/hotel_db.js';
import { HOTEL_CITIES, HOTEL_FETCH_DAYS, HOTEL_MAX_IDS, HOTEL_STAY_DAYS, REQUEST_SLEEP_MS } from '../../data/src/config.js';

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function nextNDates(n) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const db = openDbWithHotels();
  const clientId = getEnv('AMADEUS_CLIENT_ID');
  const clientSecret = getEnv('AMADEUS_CLIENT_SECRET');
  const tokenRes = await getAmadeusToken({ clientId, clientSecret });

  const dates = nextNDates(HOTEL_FETCH_DAYS);

  for (const city of HOTEL_CITIES) {
    const listRaw = await listHotelsByCity({
      token: tokenRes.access_token,
      cityCode: city,
      radius: 20,
      radiusUnit: 'KM',
      hotelSource: 'ALL'
    });

    const hotelIds = (listRaw?.data ?? [])
      .map((h) => h.hotelId)
      .filter(Boolean)
      .slice(0, HOTEL_MAX_IDS);

    if (hotelIds.length === 0) {
      console.warn(`[tdp-jobs] no hotels found for city ${city}`);
      continue;
    }

    let sentimentsByHotelId = {};
    try {
      const sentimentsRaw = await getHotelSentiments({ token: tokenRes.access_token, hotelIds });
      sentimentsByHotelId = buildHotelSentimentsMap(sentimentsRaw);
    } catch (err) {
      console.warn(`[tdp-jobs] hotel sentiments failed for ${city}: ${String(err?.message ?? err)}`);
    }

    for (const date of dates) {
      const checkOutDate = addDays(date, HOTEL_STAY_DAYS);
      const offersRaw = await searchHotelOffers({
        token: tokenRes.access_token,
        hotelIds,
        checkInDate: date,
        checkOutDate,
        adults: 1,
        currency: 'CNY'
      });

      const normalized = normalizeHotelOffers(offersRaw, {
        sentimentsByHotelId,
        defaultCity: city,
        defaultCheckIn: date,
        defaultCheckOut: checkOutDate
      });

      for (const h of normalized) {
        insertHotelOffer(db, {
          id: `${h.hotel_id}:${h.check_in}`,
          city: h.city ?? city,
          date: h.check_in,
          star_rating: h.star_rating,
          review_score: h.review_score,
          nightly_price: h.nightly_price,
          total_price: h.total_price
        });
      }

      console.log(JSON.stringify({ city, date, offers: normalized.length }));
      await sleep(REQUEST_SLEEP_MS);
    }
  }

  db.close();
}

run().catch((err) => {
  console.error(`[tdp-jobs] daily hotels failed: ${String(err?.message ?? err)}`);
  process.exit(1);
});
