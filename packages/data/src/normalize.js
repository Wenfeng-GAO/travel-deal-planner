export function normalizeFlightOffers(raw) {
  const offers = raw?.data ?? [];
  return offers.map((o) => {
    const itinerary = o.itineraries?.[0];
    const segments = itinerary?.segments ?? [];
    const totalDuration = itinerary?.duration ?? null;

    const departTime = segments[0]?.departure?.at ?? null;
    const arriveTime = segments[segments.length - 1]?.arrival?.at ?? null;

    return {
      offer_id: o.id ?? null,
      price: Number(o.price?.total ?? 0),
      currency: o.price?.currency ?? 'CNY',
      segments: segments.map((s) => ({
        from: s.departure?.iataCode,
        to: s.arrival?.iataCode,
        depart_at: s.departure?.at,
        arrive_at: s.arrival?.at,
        carrier: s.carrierCode
      })),
      layovers: Math.max(segments.length - 1, 0),
      total_duration: totalDuration,
      depart_time: departTime,
      arrive_time: arriveTime
    };
  });
}
