// Independent acceptance check against live official inventories, never fixtures.
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { isLiveTrafficDataFresh, speedLevel } from '../lib/traffic.ts';
const origin = process.argv[2] || 'http://localhost:5173';
const sources = {
  redlight: 'https://www.td.gov.hk/datagovhk_td/junctions-with-rlc/resources/junctions_with_rlc.csv',
  speed: 'https://www.td.gov.hk/datagovhk_td/locations-of-sec/resources/locations_of_sec.csv',
  snapshot: 'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml',
};
const report = [];
for (const [kind, source] of Object.entries(sources)) {
  const [api, official] = await Promise.all([fetch(`${origin}/api/cameras/${kind}`), fetch(source)]);
  assert.equal(api.status, 200);
  assert.equal(official.status, 200);
  const data = await api.json();
  const text = await official.text();
  const ids = kind === 'snapshot'
    ? new XMLParser({ parseTagValue: false }).parse(text)['image-list'].image.map(row => row.key)
    : [...text.matchAll(/^(\d+),/gm)].map(m => m[1]);
  assert.equal(data.complete, true);
  assert.equal(data.count, ids.length);
  assert.equal(data.cameras.length, data.expectedCount);
  assert.deepEqual(data.cameras.map(c => c.sourceId).sort(), ids.sort());
  assert.equal(new Set(data.cameras.map(c => c.id)).size, ids.length);
  assert.ok(data.cameras.every(c => c.name && c.lat > 22 && c.lat < 23 && c.lng > 113 && c.lng < 115));
  report.push({ layer: kind, officialCount: ids.length, displayedCount: data.count, missing: 0, duplicateIds: 0 });
}

const segmentSpeedSource = 'https://resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml';
const saturationSource = 'https://www.hkemobility.gov.hk/api/drss/layer/map?service=WFS&version=1.0.0&request=GetFeature&typeName=DRSS%3AVW_IRN_AVG_SPEED_MAP&outputFormat=application%2Fjson&srsName=EPSG%3A4326&maxFeatures=5000';
const [flowResponse, saturationResponse] = await Promise.all([
  fetch(`${origin}/api/cameras/flow`),
  fetch(saturationSource, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.hkemobility.gov.hk',
      Referer: 'https://www.hkemobility.gov.hk/en/traffic-information',
      'User-Agent': 'Mozilla/5.0',
    },
  }),
]);
assert.equal(flowResponse.status, 200);
assert.equal(saturationResponse.status, 200);
const flow = await flowResponse.json();

// The XML CDN can expose the preceding two-minute publication briefly while
// the application already has the latest one cached. Prefer the exact same
// snapshot; otherwise accept only one publication interval of skew and limit
// record-level comparisons to identical WFS speeds below.
let speedFeed;
let smallestTimestampGap = Number.POSITIVE_INFINITY;
for (let attempt = 0; attempt < 3; attempt++) {
  const response = await fetch(`${segmentSpeedSource}?verify=${Date.now()}-${attempt}`, { cache: 'no-store' });
  assert.equal(response.status, 200);
  const candidate = new XMLParser({ parseTagValue: false }).parse(await response.text()).segment_speed_list;
  const candidateTimestamp = `${candidate.date}T${candidate.time}+08:00`;
  const gap = Math.abs(Date.parse(candidateTimestamp) - Date.parse(flow.segmentsUpdated));
  if (gap < smallestTimestampGap) {
    speedFeed = candidate;
    smallestTimestampGap = gap;
  }
  if (gap === 0) break;
}
assert.ok(speedFeed, 'Official segment-speed feed is empty');
const speedRows = Array.isArray(speedFeed?.segments?.segment) ? speedFeed.segments.segment : [speedFeed?.segments?.segment].filter(Boolean);
const officialSpeeds = new Map(speedRows.map(row => [Number(row.segment_id), row]));
const segmentTimestamp = `${speedFeed.date}T${speedFeed.time}+08:00`;
assert.ok(smallestTimestampGap <= 2 * 60 * 1000, `Official feeds are out of sync by more than one publication interval: ${flow.segmentsUpdated} vs ${segmentTimestamp}`);
assert.equal(isLiveTrafficDataFresh(flow.segmentsUpdated), true);
assert.equal(flow.segmentsExpectedCount, officialSpeeds.size);
assert.equal(flow.segmentsComplete, flow.segments.length === flow.segmentsExpectedCount);
assert.equal(new Set(flow.segments.map(segment => segment.id)).size, flow.segments.length);
assert.ok(flow.segments.every(segment => segment.path.length >= 2 && segment.path.every(point => point.length === 2 && point.every(Number.isFinite))));

const saturationFeed = await saturationResponse.json();
const officialLevels = new Map((saturationFeed.features ?? []).map(feature => {
  const saturation = feature.properties?.ROAD_SATURATION_LEVEL;
  const level = saturation === 'TRAFFIC GOOD' ? 'free' : saturation === 'TRAFFIC AVERAGE' ? 'moderate' : saturation === 'TRAFFIC BAD' ? 'slow' : 'unknown';
  return [Number(feature.properties?.SEGMENT_ID), { level, speedKmh: Number(feature.properties?.SPEED) }];
}));
const exactXmlSnapshot = smallestTimestampGap === 0;
let comparableOfficialColours = 0;
for (const segment of flow.segments) {
  const official = officialSpeeds.get(segment.routeId);
  assert.ok(official, `Missing official speed row ${segment.routeId}`);
  const validSpeed = String(official.valid).toUpperCase() === 'Y' ? Number(official.speed) : null;
  if (exactXmlSnapshot) {
    assert.equal(segment.speedKmh, validSpeed === null ? null : Math.round(validSpeed), `Speed mismatch for ${segment.routeId}`);
    assert.equal(segment.level, speedLevel(validSpeed, segment.speedLimitKmh), `Calculated level mismatch for ${segment.routeId}`);
  }
  const officialLevel = officialLevels.get(segment.routeId);
  if (segment.speedKmh !== null && officialLevel && Math.round(officialLevel.speedKmh) === segment.speedKmh) {
    assert.equal(segment.level, officialLevel.level, `HKeMobility colour mismatch for ${segment.routeId}`);
    comparableOfficialColours++;
  }
}
const validSegments = flow.segments.filter(segment => segment.speedKmh !== null).length;
assert.ok(comparableOfficialColours >= validSegments * 0.9, `Too few current HKeMobility colours were comparable (${comparableOfficialColours}/${validSegments})`);
report.push({
  layer: 'flow',
  officialCount: officialSpeeds.size,
  displayedCount: flow.segments.length,
  missing: officialSpeeds.size - flow.segments.length,
  duplicateIds: 0,
  officialColourMatches: comparableOfficialColours,
  feedTimestampGapSeconds: smallestTimestampGap / 1000,
});

const image = await fetch(`${origin}/api/snapshot/H106F`);
assert.equal(image.status, 200);
assert.ok(image.headers.get('Content-Type')?.toLowerCase().startsWith('image/jpeg'));
const modified = image.headers.get('Last-Modified');
const fetchedAt = image.headers.get('X-Snapshot-Fetched-At');
assert.ok(modified && Number.isFinite(Date.parse(modified)));
assert.ok(fetchedAt && Number.isFinite(Date.parse(fetchedAt)));
const imageBytes = new Uint8Array(await image.arrayBuffer());
assert.ok(imageBytes.length > 1000);
assert.deepEqual([...imageBytes.slice(0, 3)], [0xff, 0xd8, 0xff]);
assert.equal((await fetch(`${origin}/api/cameras/invalid`)).status, 404);
assert.equal((await fetch(`${origin}/api/snapshot/invalid!`)).status, 400);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), report, snapshot: { id: 'H106F', bytes: imageBytes.length, updatedAt: modified }, invalidRoutesRejected: true }, null, 2));
