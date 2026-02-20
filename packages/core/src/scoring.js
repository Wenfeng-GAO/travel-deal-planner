import { filterComfortHotels } from '../../data/src/hotels.js';
import { computeBookingWindow, explainBookingWindow } from './booking.js';
import { computeTravelWindow } from './travel_window.js';
import { computePriceTrend, explainPriceTrend } from './price_trend.js';

export function scoreLowestPlan({ flights, hotels }) {
  const comfortHotels = filterComfortHotels(hotels);
  if (!flights.length || !comfortHotels.length) return null;
  const cheapestFlight = flights.reduce((a, b) => (a.price <= b.price ? a : b));
  const cheapestHotel = comfortHotels.reduce((a, b) => (a.total_price <= b.total_price ? a : b));
  return {
    total_price: cheapestFlight.price + cheapestHotel.total_price,
    flight: cheapestFlight,
    hotel: cheapestHotel
  };
}

export function scoreComfortPlan({ flights, hotels }) {
  const comfortHotels = filterComfortHotels(hotels);
  const filteredFlights = flights.filter((f) => f.layovers <= 1);
  if (!filteredFlights.length || !comfortHotels.length) return null;
  const cheapestFlight = filteredFlights.reduce((a, b) => (a.price <= b.price ? a : b));
  const cheapestHotel = comfortHotels.reduce((a, b) => (a.total_price <= b.total_price ? a : b));
  return {
    total_price: cheapestFlight.price + cheapestHotel.total_price,
    flight: cheapestFlight,
    hotel: cheapestHotel,
    constraints: { max_layovers: 1 }
  };
}

export function attachDelta(lowest, comfort) {
  if (!lowest || !comfort) return null;
  return {
    ...comfort,
    delta_vs_lowest: comfort.total_price - lowest.total_price
  };
}

function inferTripLengthDays(tripLengthDays, hotels) {
  if (Number.isFinite(tripLengthDays) && tripLengthDays > 0) {
    return Math.round(tripLengthDays);
  }
  for (const h of hotels ?? []) {
    if (!h?.nightly_price || !h?.total_price) continue;
    const nights = Math.round(h.total_price / h.nightly_price);
    if (Number.isFinite(nights) && nights > 0 && nights <= 30) return nights;
  }
  return 5;
}

export function summarizeFlights(flights) {
  return flights.map((f) => ({
    price: f.price,
    currency: f.currency,
    layovers: f.layovers,
    depart_time: f.depart_time,
    arrive_time: f.arrive_time,
    segments: f.segments
  }));
}

export function summarizeHotels(hotels) {
  return hotels.map((h) => ({
    total_price: h.total_price,
    nightly_price: h.nightly_price,
    star_rating: h.star_rating,
    review_score: h.review_score
  }));
}

export function summarizeHotelRange(hotels) {
  if (!hotels?.length) return null;
  const totals = hotels.map((h) => h.total_price).filter((v) => Number.isFinite(v));
  if (!totals.length) return null;
  const sorted = totals.sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    count: sorted.length,
    min_total_price: sorted[0],
    median_total_price: median,
    max_total_price: sorted[sorted.length - 1]
  };
}

export function topComfortHotels(hotels, limit = 5) {
  if (!hotels?.length) return [];
  const ranked = [...hotels].sort((a, b) => a.total_price - b.total_price);
  return ranked.slice(0, limit).map((h) => ({
    hotel_id: h.hotel_id ?? null,
    hotel_name: h.hotel_name ?? null,
    total_price: h.total_price,
    nightly_price: h.nightly_price,
    star_rating: h.star_rating,
    review_score: h.review_score
  }));
}

function minPriceByDate(priceSeries) {
  const map = new Map();
  for (const p of priceSeries ?? []) {
    if (!p?.date) continue;
    const cur = map.get(p.date);
    if (cur == null || p.price < cur) map.set(p.date, p.price);
  }
  return map;
}

function minHotelByDate(hotels) {
  const map = new Map();
  for (const h of hotels ?? []) {
    if (!h?.date || !Number.isFinite(h.total_price)) continue;
    const cur = map.get(h.date);
    if (cur == null || h.total_price < cur) map.set(h.date, h.total_price);
  }
  return map;
}

function mapToSortedArray(map) {
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, price]) => ({ date, price }));
}

export function summarizeDailyMins(priceSeries, hotels) {
  const flightMin = minPriceByDate(priceSeries);
  const hotelMin = minHotelByDate(hotels);
  const flightDaily = mapToSortedArray(flightMin);
  const hotelDaily = mapToSortedArray(hotelMin);
  const totalDaily = [];

  const flightMap = new Map(flightDaily.map((d) => [d.date, d.price]));
  for (const h of hotelDaily) {
    const f = flightMap.get(h.date);
    if (f == null) continue;
    totalDaily.push({ date: h.date, price: f + h.price });
  }

  return {
    flight_daily_min: flightDaily,
    hotel_daily_min: hotelDaily,
    total_daily_min: totalDaily.sort((a, b) => a.date.localeCompare(b.date))
  };
}

export function summarizeTripCost(priceSeries, hotels) {
  const flightMin = minPriceByDate(priceSeries);
  const hotelMin = minHotelByDate(hotels);
  if (!flightMin.size || !hotelMin.size) return null;

  const totals = [];
  for (const [date, flightPrice] of flightMin.entries()) {
    const hotelPrice = hotelMin.get(date);
    if (hotelPrice == null) continue;
    totals.push({ date, total: flightPrice + hotelPrice });
  }
  if (!totals.length) return null;
  totals.sort((a, b) => a.total - b.total);
  const median = totals[Math.floor(totals.length / 2)];
  const min = totals[0];
  const max = totals[totals.length - 1];
  return {
    best_date: min.date,
    min_total_price: min.total,
    median_total_price: median.total,
    max_total_price: max.total,
    count: totals.length
  };
}

export function buildRecommendation({ flights, hotels, priceSeries, tripLengthDays }) {
  const lowest = scoreLowestPlan({ flights, hotels });
  const comfort = scoreComfortPlan({ flights, hotels });
  const comfortWithDelta = attachDelta(lowest, comfort);
  const bookingWindow = computeBookingWindow(priceSeries);
  const tripDays = inferTripLengthDays(tripLengthDays, hotels);
  const priceTrend = computePriceTrend(priceSeries);
  const comfortHotels = filterComfortHotels(hotels);
  const tripCostSummary = summarizeTripCost(priceSeries, comfortHotels);
  const dailyMins = summarizeDailyMins(priceSeries, comfortHotels);
  const travelSeries = dailyMins.total_daily_min.length ? dailyMins.total_daily_min : priceSeries;
  const travelWindow = computeTravelWindow(travelSeries, tripDays);
  const travelWindowBasis = dailyMins.total_daily_min.length ? 'flight_plus_hotel' : 'flight_only';
  const explanations = [];

  if (comfortWithDelta?.constraints?.max_layovers === 1) {
    explanations.push('体验方案限制最多一次转机，已在航班筛选中应用。');
  }
  if (bookingWindow) {
    explanations.push(`订购窗口参考历史价格分位数（P10-P50），价格接近该区间时更划算。`);
  }
  if (travelWindow?.start_date && travelWindow?.end_date) {
    const basis = travelWindowBasis === 'flight_plus_hotel' ? '机票+酒店' : '机票';
    explanations.push(`推荐出行窗口通过连续 ${tripDays} 天游的最低${basis}成本求和得到（${travelWindow.start_date} 到 ${travelWindow.end_date}）。`);
  }
  if (priceTrend?.trend) {
    explanations.push(`价格趋势为 ${priceTrend.trend}，波动系数 ${priceTrend.volatility}。`);
  }
  if (tripCostSummary?.best_date) {
    explanations.push(`机票+酒店合计最低的日期为 ${tripCostSummary.best_date}。`);
  }

  return {
    lowest_plan: lowest,
    comfort_plan: comfortWithDelta,
    booking_window: explainBookingWindow(bookingWindow),
    travel_window: travelWindow,
    travel_window_basis: travelWindowBasis,
    trip_length_days: tripDays,
    price_trend: explainPriceTrend(priceTrend),
    hotel_price_range: summarizeHotelRange(comfortHotels),
    comfort_hotels: topComfortHotels(comfortHotels, 5),
    trip_cost_summary: tripCostSummary,
    price_series_summary: dailyMins,
    explanations
  };
}
