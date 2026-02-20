# Travel Deal Planner

A web product that recommends the cheapest travel window and a comfort‑oriented low‑price option, starting with Shanghai departures and pilot destinations: Urumqi, Dali, and Chiang Mai.

## Docs
- Product: /Users/wenfeng/Documents/code/travel-deal-planner/docs/PRODUCT.md
- Development: /Users/wenfeng/Documents/code/travel-deal-planner/docs/DEVELOPMENT.md

## API (local)
```
# sample data
curl "http://localhost:3000/recommendations?source=sample"

# amadeus (set env first)
export AMADEUS_CLIENT_ID=...
export AMADEUS_CLIENT_SECRET=...
curl "http://localhost:3000/recommendations?origin=PVG&destination=URC&date=2026-04-06"

# snapshot-based (flights + hotels)
# (seed hotels first if you want data)
curl "http://localhost:3000/recommendations?source=snapshots&origin=PVG&destination=URC"

# optional: set trip length days (defaults to 5)
curl "http://localhost:3000/recommendations?source=snapshots&origin=PVG&destination=URC&trip_length_days=5"

# list stored snapshots
curl "http://localhost:3000/snapshots?origin=PVG&destination=URC"
```

## Jobs (daily fetch)
```
export AMADEUS_CLIENT_ID=...
export AMADEUS_CLIENT_SECRET=...
node /Users/wenfeng/Documents/code/travel-deal-planner/packages/jobs/src/daily_fetch.js
```

## Hotels (daily fetch)
```
export AMADEUS_CLIENT_ID=...
export AMADEUS_CLIENT_SECRET=...
node /Users/wenfeng/Documents/code/travel-deal-planner/packages/jobs/src/daily_hotels.js
```

## Hotels (seed)
```
node /Users/wenfeng/Documents/code/travel-deal-planner/packages/data/src/hotel_seed.js
```

## Tests
```
pnpm install
pnpm test
```

## Web (static)
```
python -m http.server 5173 --directory /Users/wenfeng/Documents/code/travel-deal-planner/apps/web
```
然后访问 `http://localhost:5173`。

## Web (served by API)
启动 API 后直接访问 `http://localhost:3000`。

## Start
```
pnpm start
```
