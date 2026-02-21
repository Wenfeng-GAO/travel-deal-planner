const CITY_TO_IATA = {
  '上海': 'PVG',
  '上海市': 'PVG',
  '浦东': 'PVG',
  '乌鲁木齐': 'URC',
  '大理': 'DLU',
  '丽江': 'LJG',
  '清迈': 'CNX'
};

export function normalizeIataCode(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return CITY_TO_IATA[raw] ?? CITY_TO_IATA[upper] ?? null;
}

export function ensureIataCode(input, label = 'location') {
  const code = normalizeIataCode(input);
  if (!code) {
    throw new Error(`${label} must be a 3-letter IATA code or supported city name`);
  }
  return code;
}

export function listSupportedCities() {
  return Object.keys(CITY_TO_IATA);
}
