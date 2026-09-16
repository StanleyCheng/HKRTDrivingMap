// Independent acceptance check against live official inventories, never fixtures.
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
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
const image = await fetch(`${origin}/api/snapshot/H106F`);
assert.equal(image.status, 200);
const shot = await image.json();
assert.ok(shot.image.startsWith('data:image/jpeg;base64,/9j/'));
assert.ok(shot.updatedAt && Number.isFinite(Date.parse(shot.updatedAt)));
assert.equal((await fetch(`${origin}/api/cameras/invalid`)).status, 404);
assert.equal((await fetch(`${origin}/api/snapshot/invalid!`)).status, 400);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), report, snapshot: { id: 'H106F', bytes: Buffer.from(shot.image.split(',')[1], 'base64').length, updatedAt: shot.updatedAt }, invalidRoutesRejected: true }, null, 2));
