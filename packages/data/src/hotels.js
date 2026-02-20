function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function diffNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const nights = Math.round((end - start) / 86400000);
  return nights > 0 ? nights : 0;
}

export function buildHotelSentimentsMap(raw) {
  const out = {};
  const data = raw?.data ?? [];
  for (const s of data) {
    const id = s?.hotelId;
    if (!id) continue;
    out[id] = {
      overallRating: parseNumber(s.overallRating)
    };
  }
  return out;
}

export function normalizeHotelOffers(raw, { sentimentsByHotelId = {}, defaultCity, defaultCheckIn, defaultCheckOut } = {}) {
  const entries = raw?.data ?? [];
  const byHotel = new Map();

  for (const entry of entries) {
    const hotel = entry?.hotel ?? {};
    const hotelId = hotel.hotelId ?? null;
    if (!hotelId) continue;

    const starRating = parseNumber(hotel.rating);
    const sentiment = sentimentsByHotelId[hotelId];
    const reviewScore = sentiment?.overallRating
      ? Math.round((sentiment.overallRating / 20) * 10) / 10
      : starRating;

    const offers = entry?.offers ?? [];
    for (const offer of offers) {
      const checkIn = offer.checkInDate ?? defaultCheckIn ?? null;
      const checkOut = offer.checkOutDate ?? defaultCheckOut ?? null;
      const nights = diffNights(checkIn, checkOut);
      const total = parseNumber(offer?.price?.total);
      if (!total) continue;
      const nightly = nights ? total / nights : parseNumber(offer?.price?.base);
      const currency = offer?.price?.currency ?? null;

      const existing = byHotel.get(hotelId);
      if (!existing || total < existing.total_price) {
        byHotel.set(hotelId, {
          hotel_id: hotelId,
          hotel_name: hotel?.name ?? null,
          city: hotel?.cityCode ?? defaultCity ?? null,
          check_in: checkIn,
          check_out: checkOut,
          total_price: Math.round(total * 100) / 100,
          nightly_price: Math.round(nightly * 100) / 100,
          star_rating: starRating,
          review_score: reviewScore,
          currency
        });
      }
    }
  }

  return Array.from(byHotel.values());
}

export function filterComfortHotels(hotels) {
  return hotels.filter((h) => h.star_rating >= 3 && h.review_score >= 4);
}
