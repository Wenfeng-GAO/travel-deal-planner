import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeHotelOffers, buildHotelSentimentsMap } from '../src/hotels.js';

test('normalizeHotelOffers maps Amadeus offers with sentiments', () => {
  const rawOffers = {
    data: [
      {
        hotel: { hotelId: 'H1', name: 'Hotel One', rating: '4', cityCode: 'URC' },
        offers: [
          {
            checkInDate: '2026-04-01',
            checkOutDate: '2026-04-03',
            price: { currency: 'CNY', total: '200.00' }
          }
        ]
      }
    ]
  };
  const sentimentsRaw = { data: [{ hotelId: 'H1', overallRating: 90 }] };
  const sentiments = buildHotelSentimentsMap(sentimentsRaw);
  const normalized = normalizeHotelOffers(rawOffers, { sentimentsByHotelId: sentiments });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].hotel_id, 'H1');
  assert.equal(normalized[0].review_score, 4.5);
  assert.equal(normalized[0].nightly_price, 100);
});
