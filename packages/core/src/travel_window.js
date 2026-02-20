function minByDate(priceSeries) {
  const map = new Map();
  for (const p of priceSeries) {
    if (!p?.date) continue;
    const cur = map.get(p.date);
    if (cur == null || p.price < cur) map.set(p.date, p.price);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export function computeTravelWindow(priceSeries, tripLengthDays) {
  if (!priceSeries?.length) return null;
  const series = minByDate(priceSeries); // [date, minPrice]
  if (series.length < tripLengthDays) return null;

  let best = { sum: Number.POSITIVE_INFINITY, start: null, end: null };

  for (let i = 0; i <= series.length - tripLengthDays; i++) {
    let sum = 0;
    for (let j = 0; j < tripLengthDays; j++) {
      sum += series[i + j][1];
    }
    if (sum < best.sum) {
      best = {
        sum,
        start: series[i][0],
        end: series[i + tripLengthDays - 1][0]
      };
    }
  }

  return {
    start_date: best.start,
    end_date: best.end,
    estimated_flight_cost: best.sum,
    method: 'min-sum-of-daily-min-prices'
  };
}
