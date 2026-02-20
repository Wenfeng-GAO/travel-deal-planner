export function computeBookingWindow(priceSeries) {
  if (!priceSeries?.length) return null;
  const sorted = [...priceSeries].sort((a, b) => a.price - b.price);
  const p10 = sorted[Math.floor(sorted.length * 0.1)]?.price ?? null;
  const p50 = sorted[Math.floor(sorted.length * 0.5)]?.price ?? null;
  const min = sorted[0]?.price ?? null;
  return { p10, p50, min };
}

export function explainBookingWindow(window) {
  if (!window) return null;
  return {
    summary: 'Lower percentiles indicate lower historical prices; book when price approaches P10-P50 range.',
    p10: window.p10,
    p50: window.p50,
    min: window.min
  };
}
