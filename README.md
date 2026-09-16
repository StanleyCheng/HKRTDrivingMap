# 香港實時交通資訊

Hong Kong Real-Time Traffic Monitor. Responsive Traditional Chinese map with all officially published red-light junctions, speed-enforcement housings and traffic snapshot locations. No application authentication, mock locations, static fallback datasets, or API keys.

## Run

Node 22.13 or later. Install with `npm ci`, then `npm run dev`. Build with `npm run build`. Preview the built Cloudflare Worker with `npm start`. Validate types with `npx tsc --noEmit`.

Stack: React, TypeScript, Vinext/Vite, Cloudflare Worker API routes, Leaflet 1.9, Leaflet.markercluster, fast-xml-parser. OpenStreetMap supplies the basemap (non-government); all camera information comes from government sources.

## Official sources

- [Red-light junctions dataset](https://data.gov.hk/tc-data/dataset/hk-td-tis_25-junctions-with-rlc): [CSDI FeatureServer](https://portal.csdi.gov.hk/server/rest/services/common/td_rcd_1671693287017_1644/FeatureServer/0?f=pjson).
- [Speed-enforcement housings dataset](https://data.gov.hk/tc-data/dataset/hk-td-tis_26-locations-of-sec): [CSDI FeatureServer](https://portal.csdi.gov.hk/server/rest/services/common/td_rcd_1671693428549_89372/FeatureServer/0?f=pjson).
- [Traffic snapshots dataset](https://data.gov.hk/tc-data/dataset/hk-td-tis_2-traffic-snapshot-images): [complete Traditional Chinese XML inventory](https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml). Images use the exact URLs supplied by that inventory at `https://tdcctv.data.one.gov.hk/`.

The enforcement API first queries all object IDs and the independent official total, then fetches every ID in batches of 150, requesting WGS84 coordinates. Counts, identifiers, uniqueness and coordinates are verified before exposing a successful layer. It does not use a bounding box, nearest-camera limit, or just the first page. The complete XML supplies all snapshot locations. Invalid or incomplete sources produce an explicit error rather than silently dropping records.

Local same-origin routes remove browser CORS limitations. Source requests have timeouts and one retry. Successful inventories are cached in memory for five minutes; a manual refresh bypasses that cache. Failed refreshes retain any previously displayed real data, explicitly labelled as an unsuccessful update. Sources fail independently. No fabricated fallback is used.

The selected snapshot is fetched immediately and every two minutes while the page is visible. `Last-Modified` is labelled as the official image file update time, distinct from capture time printed within the image and from the local retrieval time. Missing timestamps are explicitly shown. Images more than ten minutes old are flagged. An official HTTP-200 “No Service” JPEG is preserved with an explanatory note; availability cannot reliably be inferred from JPEG HTTP status alone.

## Validation

Run `node scripts/verify-live.mjs http://localhost:5173` against a running preview. This independently compares all source IDs with the Transport Department CSV lists and original snapshot XML, checks counts/duplicates/coordinates, fetches a real JPEG and timestamp, and checks invalid route rejection.

Verified 2026-09-16: **230 red-light locations, 164 speed-enforcement housings, 1,013 snapshots; 1,407 total; zero missing or duplicate IDs.** Counts are dynamic, not hardcoded into the application.

Browser checks covered individual layer counts, all-off state, restoring every layer, cluster expansion, marker details, snapshot loading, attribution dialog, desktop/mobile layout, and an aborted source request followed by recovery. Network-failure simulation is test-only; no mock data is delivered by the website.

## Source limitations

Enforcement sources identify published junctions/housings, not the number of operational cameras, enforcement activity, or live camera feeds. The speed-housing inventory excludes government tunnels and control areas. Snapshots are periodically updated still images, not live video; each upstream camera may temporarily stop serving. The website exposes those limitations in Traditional Chinese.

The local preview is available in the Codex browser panel. Sites hosting configuration is in `.openai/hosting.json`.
