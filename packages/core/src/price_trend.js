function toDayNumber(dateStr) {
  if (!dateStr) return null;
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 86400000);
}

function summarizeStats(values) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  return { min, max, avg, stddev };
}

function linearRegressionSlope(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const xAvg = xs.reduce((a, b) => a + b, 0) / n;
  const yAvg = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xAvg;
    num += dx * (ys[i] - yAvg);
    den += dx * dx;
  }
  if (den === 0) return 0;
  return num / den;
}

export function computePriceTrend(priceSeries) {
  if (!priceSeries?.length) return null;
  const rows = priceSeries
    .map((p) => ({ day: toDayNumber(p.date), price: p.price }))
    .filter((p) => p.day != null && Number.isFinite(p.price))
    .sort((a, b) => a.day - b.day);

  if (rows.length === 0) return null;

  const days = rows.map((r) => r.day);
  const prices = rows.map((r) => r.price);
  const stats = summarizeStats(prices);
  if (!stats) return null;

  const slopePerDay = linearRegressionSlope(days, prices);
  const slopePctPerDay = stats.avg ? slopePerDay / stats.avg : 0;
  const volatility = stats.avg ? stats.stddev / stats.avg : 0;

  let trend = 'stable';
  if (slopePctPerDay > 0.002) trend = 'rising';
  if (slopePctPerDay < -0.002) trend = 'falling';

  return {
    count: rows.length,
    date_start: priceSeries.find((p) => p.date)?.date ?? null,
    date_end: priceSeries[priceSeries.length - 1]?.date ?? null,
    min: stats.min,
    max: stats.max,
    avg: Math.round(stats.avg * 100) / 100,
    stddev: Math.round(stats.stddev * 100) / 100,
    volatility: Math.round(volatility * 10000) / 10000,
    slope_per_day: Math.round(slopePerDay * 100) / 100,
    slope_pct_per_day: Math.round(slopePctPerDay * 10000) / 10000,
    trend
  };
}

export function explainPriceTrend(trend) {
  if (!trend) return null;
  return {
    summary: 'Trend is based on linear regression over daily prices; volatility is stddev/avg.',
    trend: trend.trend,
    slope_per_day: trend.slope_per_day,
    slope_pct_per_day: trend.slope_pct_per_day,
    volatility: trend.volatility
  };
}
