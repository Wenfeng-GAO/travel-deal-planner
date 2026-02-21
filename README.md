# Travel Deal Planner

A web product that recommends the cheapest travel window and a comfort‑oriented low‑price option, starting with Shanghai departures and pilot destinations: Urumqi, Dali, and Chiang Mai.

## Docs
- Product: /Users/wenfeng/Documents/code/travel-deal-planner/docs/PRODUCT.md
- Development: /Users/wenfeng/Documents/code/travel-deal-planner/docs/DEVELOPMENT.md

## API (local)
Create a local `.env` (gitignored) or export env vars before running Amadeus calls:

```
cp .env.example .env
# fill AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET
```

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

## Flights (backfill past + future)
```
# default: past 365 days + future 365 days, skip past dates unless --force-past
node /Users/wenfeng/Documents/code/travel-deal-planner/packages/jobs/src/backfill_flights.js

# force querying past dates (Amadeus may reject past dates)
node /Users/wenfeng/Documents/code/travel-deal-planner/packages/jobs/src/backfill_flights.js --force-past

# custom range
node /Users/wenfeng/Documents/code/travel-deal-planner/packages/jobs/src/backfill_flights.js --start 2025-02-21 --end 2027-02-21
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
