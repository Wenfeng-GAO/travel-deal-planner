export const ROUTES = [
  { origin: 'PVG', destination: 'URC' },
  { origin: 'PVG', destination: 'DLU' },
  { origin: 'PVG', destination: 'LJG' },
  { origin: 'PVG', destination: 'CNX' }
];

export const FETCH_DAYS = 180; // 6 months
export const REQUEST_SLEEP_MS = 250; // basic throttling

export const HOTEL_CITIES = ['URC', 'DLU', 'LJG', 'CNX'];
export const HOTEL_FETCH_DAYS = 60; // next 2 months for hotels
export const HOTEL_MAX_IDS = 20;
export const HOTEL_STAY_DAYS = 5;
