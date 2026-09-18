import { XMLParser } from 'fast-xml-parser';
import { Camera, CameraData, FlowSegment, IncidentNotice, LayerKind, SpeedLevel, featureService, snapshotInventory, snapshotInventoryEn, speedLevelColors } from './traffic';

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, processEntities: true });
const cached = new Map<LayerKind, { expires: number; data: CameraData }>();
const pending = new Map<LayerKind, Promise<CameraData>>();
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxOfficialRedirects = 3;
type OfficialFetchOptions = { allowedRedirectHosts?: readonly string[] };
type SnapshotRow = { key: string; description: string; district?: string; region?: string; latitude: string | number; longitude: string | number; url: string };

function isAllowedHttpsUrl(url: URL, allowedHosts: Set<string>) {
  return url.protocol === 'https:' && url.port === '' && !url.username && !url.password && allowedHosts.has(url.hostname);
}

export async function officialFetch(url: string, options: OfficialFetchOptions = {}) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const allowedHosts = options.allowedRedirectHosts && new Set(options.allowedRedirectHosts.map(host => host.toLowerCase()));
      const signal = AbortSignal.timeout(20000);
      let currentUrl = new URL(url);
      let redirects = 0;
      if (allowedHosts && !isAllowedHttpsUrl(currentUrl, allowedHosts)) throw new Error('官方資料網址不在允許清單內。');

      while (true) {
        const response = await fetch(currentUrl, { signal, redirect: allowedHosts ? 'manual' : 'follow', headers: { Accept: '*/*' } });
        if (allowedHosts && redirectStatuses.has(response.status)) {
          await response.body?.cancel();
          if (redirects >= maxOfficialRedirects) throw new Error('官方資料服務重新導向次數過多。');
          const location = response.headers.get('Location');
          if (!location) throw new Error('官方資料服務重新導向未提供位置。');
          const nextUrl = new URL(location, currentUrl);
          if (!isAllowedHttpsUrl(nextUrl, allowedHosts)) throw new Error('官方資料服務重新導向至未受信任的網址。');
          currentUrl = nextUrl;
          redirects++;
          continue;
        }
        if (!response.ok) throw new Error(`官方資料服務回應 HTTP ${response.status}`);
        return response;
      }
    } catch (error) { last = error; }
  }
  throw new Error(last instanceof Error && last.name === 'TimeoutError' ? '官方資料服務回應逾時，請稍後再試。' : `暫時無法連接官方資料服務。${last instanceof Error ? last.message : ''}`);
}
async function json(url: string) {
  const r = await officialFetch(url);
  const body = await r.json() as { error?: { message?: string; code: number }; objectIds?: number[]; count: number; exceededTransferLimit?: boolean; features?: { attributes: { OBJECTID: number; PopupInfo: string }; geometry?: { x: number; y: number } }[] };
  if (body.error) throw new Error(`官方 API 錯誤：${body.error.message ?? body.error.code}`);
  return body;
}
function textOnly(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}
export function popupFields(html: string): Record<string, string> {
  return Object.fromEntries([...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => [textOnly(m[1]), textOnly(m[2])]));
}
function validate(cameras: Camera[], expected: number) {
  if (cameras.length !== expected || new Set(cameras.map(c => c.id)).size !== expected) throw new Error(`官方資料未能完整載入（收到 ${cameras.length} 筆，預期 ${expected} 筆），請重試。`);
  const invalid = cameras.filter(c => !c.name || !Number.isFinite(c.lat) || !Number.isFinite(c.lng) || c.lat < 22 || c.lat > 23 || c.lng < 113 || c.lng > 115);
  if (invalid.length) throw new Error(`官方資料有 ${invalid.length} 筆位置或座標不完整，暫時無法完整顯示此圖層。`);
}
async function loadEnforcement(kind: 'redlight' | 'speed'): Promise<CameraData> {
  const source = featureService(kind);
  // No feature transfer limit applies to returnIdsOnly. Fetch and verify ALL IDs.
  const [inventory, countResult] = await Promise.all([
    json(`${source}/query?where=1%3D1&returnIdsOnly=true&f=json`),
    json(`${source}/query?where=1%3D1&returnCountOnly=true&f=json`),
  ]);
  const ids: number[] = inventory.objectIds ?? [];
  if (!Number.isInteger(countResult.count) || ids.length !== countResult.count) throw new Error('官方位置名冊數量不一致，請重新載入。');
  const cameras: Camera[] = [];
  const received = new Set<number>();
  for (let offset = 0; offset < ids.length; offset += 150) {
    const batch = ids.slice(offset, offset + 150);
    const result = await json(`${source}/query?objectIds=${batch.join(',')}&outFields=*&returnGeometry=true&outSR=4326&f=json`);
    if (result.exceededTransferLimit) throw new Error('官方 API 截斷了位置資料，請稍後重試。');
    for (const feature of result.features ?? []) {
      const a = feature.attributes;
      const p = popupFields(a.PopupInfo ?? '');
      received.add(Number(a.OBJECTID));
      cameras.push({ id: `${kind}-${a.OBJECTID}`, sourceId: p.RLC_ID ?? p.SEC_ID ?? String(a.OBJECTID), kind,
        name: p.SITE_DESC_CHI, nameEn: p.SITE_DESC_ENG, lat: feature.geometry?.y ?? NaN, lng: feature.geometry?.x ?? NaN,
        remarks: p.REMARKS || undefined, sourceUpdated: p.LAST_UPD_DATE || undefined });
    }
  }
  if (ids.some(id => !received.has(id))) throw new Error('有官方位置未成功載入，請重試。');
  validate(cameras, countResult.count);
  return { cameras, count: cameras.length, expectedCount: countResult.count, complete: true, fetchedAt: new Date().toISOString(), sourceLastModified: null, source };
}
async function loadSnapshots(): Promise<CameraData> {
  const [response, englishResponse] = await Promise.all([
    officialFetch(snapshotInventory, { allowedRedirectHosts: ['static.data.gov.hk'] }),
    officialFetch(snapshotInventoryEn, { allowedRedirectHosts: ['static.data.gov.hk'] }).catch(() => null),
  ]);
  const raw = parser.parse(await response.text())?.['image-list']?.image;
  if (!raw) throw new Error('官方快拍名冊格式不符或未提供資料。');
  const rows = (Array.isArray(raw) ? raw : [raw]) as SnapshotRow[];
  let englishRows: SnapshotRow[] = [];
  if (englishResponse) {
    try {
      const englishRaw = parser.parse(await englishResponse.text())?.['image-list']?.image;
      englishRows = englishRaw ? (Array.isArray(englishRaw) ? englishRaw : [englishRaw]) as SnapshotRow[] : [];
    } catch {
      // The Traditional Chinese inventory remains authoritative if the optional translation feed is malformed.
    }
  }
  const englishByKey = new Map<string, { description?: string; district?: string; region?: string }>(englishRows.map(row => [String(row.key), row]));
  const cameras: Camera[] = rows.map(row => {
    const english = englishByKey.get(String(row.key));
    return {
      id: `snapshot-${row.key}`,
      sourceId: row.key,
      kind: 'snapshot',
      name: row.description?.replace(/\s*\[[^\]]+\]$/, ''),
      nameEn: english?.description?.replace(/\s*\[[^\]]+\]$/, ''),
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      district: row.district,
      districtEn: english?.district,
      region: row.region,
      regionEn: english?.region,
      imageUrl: row.url,
    };
  });
  validate(cameras, rows.length);
  return { cameras, count: cameras.length, expectedCount: rows.length, complete: true, fetchedAt: new Date().toISOString(), sourceLastModified: response.headers.get('Last-Modified'), source: snapshotInventory };
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  return rows;
}
function inHongKong(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 22 && lat <= 23 && lng >= 113 && lng <= 115;
}

const detectorInfoUrl = 'https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/traffic_speed_volume_occ_info.csv';
const rawSpeedUrl = 'https://resource.data.one.gov.hk/td/traffic-detectors/rawSpeedVol-all.xml';
const segmentInfoUrl = 'https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/speed_segments_info.csv';
const segmentSpeedUrl = 'https://resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml';
const segmentCenterlineUrl = 'https://portal.csdi.gov.hk/server/rest/services/common/td_rcd_1638949160594_2844/FeatureServer/10/query';
const speedNewsUrl = 'https://resource.data.one.gov.hk/td/en/specialtrafficnews.xml';
const alsLookupUrl = 'https://www.als.gov.hk/lookup';
const parkingBaseUrl = 'https://api.data.gov.hk/v1/carpark-info-vacancy';
const rainfallUrl = (lang: string) => `https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=${lang}`;

function speedLevel(speed: number | null): SpeedLevel {
  if (speed === null) return 'unknown';
  if (speed < 25) return 'slow';
  if (speed < 45) return 'moderate';
  return 'free';
}

function pickLatestPeriod<T extends { period_from?: string; period_to?: string }>(period: T | T[] | undefined): T | undefined {
  const list = Array.isArray(period) ? period : period ? [period] : [];
  if (!list.length) return undefined;
  return list.reduce((latest, current) => {
    if (!current.period_to) return latest;
    return !latest.period_to || current.period_to > latest.period_to ? current : latest;
  }, list[0]);
}

function round5(value: number): number {
  return Math.round(value * 100000) / 100000;
}

function isUnnamedName(name: string | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  return trimmed === '' || trimmed === '-99' || trimmed === '－９９';
}

function parseSegmentInfo(text: string): Map<number, number> {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const header = rows.shift()?.map(cell => cell.trim().toLowerCase()) ?? [];
  const idIndex = header.indexOf('irn_id');
  const routeIndex = header.indexOf('ucase(route)');
  const map = new Map<number, number>();
  if (idIndex < 0 || routeIndex < 0) return map;
  for (const row of rows) {
    const routeNum = Number(row[routeIndex]);
    if (Number.isFinite(routeNum) && routeNum > 0) map.set(Number(row[idIndex]), routeNum);
  }
  return map;
}

type SegmentSpeed = { speed: number; valid: boolean };
async function loadSegmentSpeeds(): Promise<{ byId: Map<number, SegmentSpeed>; updated: string | undefined }> {
  const response = await officialFetch(segmentSpeedUrl, { allowedRedirectHosts: ['resource.data.one.gov.hk'] });
  const raw = parser.parse(await response.text())?.['segment_speed_list'];
  const segments = raw?.segments?.segment;
  const rows = (Array.isArray(segments) ? segments : segments ? [segments] : []) as { segment_id: string; speed: string; valid: string }[];
  const byId = new Map<number, SegmentSpeed>();
  for (const row of rows) {
    byId.set(Number(row.segment_id), { speed: Number(row.speed), valid: String(row.valid).toUpperCase() === 'Y' });
  }
  const updated = raw?.date && raw?.time ? `${raw.date}T${raw.time}+08:00` : undefined;
  return { byId, updated };
}

type SegmentGeometry = { name: string; nameEn?: string; routeNum?: number; direction?: number; path: [number, number][] };
let segmentGeometryCache: { expires: number; map: Map<number, SegmentGeometry> } | null = null;
let segmentGeometryRefresh: Promise<Map<number, SegmentGeometry>> | null = null;
const segmentGeometryTtl = 24 * 60 * 60 * 1000;

async function fetchSegmentGeometry(routeIds: Iterable<number>): Promise<Map<number, SegmentGeometry>> {
  const infoText = await (await officialFetch(segmentInfoUrl, { allowedRedirectHosts: ['static.data.gov.hk'] })).text();
  const routeNumMap = parseSegmentInfo(infoText);
  const ids = [...new Set([...routeIds, ...routeNumMap.keys()])].sort((a, b) => a - b);
  const geometry = new Map<number, SegmentGeometry>();
  for (let offset = 0; offset < ids.length; offset += 150) {
    const batch = ids.slice(offset, offset + 150);
    const result = await json(`${segmentCenterlineUrl}?where=${encodeURIComponent(`ROUTE_ID IN (${batch.join(',')})`)}&outFields=ROUTE_ID,STREET_ENAME,STREET_CNAME,TRAVEL_DIRECTION&returnGeometry=true&outSR=4326&f=json`) as {
      exceededTransferLimit?: boolean;
      features?: { attributes: { ROUTE_ID: number; STREET_ENAME?: string; STREET_CNAME?: string; TRAVEL_DIRECTION?: number }; geometry: { paths: number[][][] } }[];
    };
    if (result.exceededTransferLimit) throw new Error('官方道路網絡 API 截斷了位置資料，請稍後重試。');
    for (const feature of result.features ?? []) {
      const a = feature.attributes;
      const routeId = Number(a.ROUTE_ID);
      if (!Number.isFinite(routeId)) continue;
      const paths = feature.geometry.paths;
      const best = paths.reduce((longest, path) => path.length > longest.length ? path : longest, paths[0] ?? []);
      if (!best.length) continue;
      const path: [number, number][] = best.map(pair => [round5(pair[1]), round5(pair[0])]);
      const routeNum = routeNumMap.get(routeId);
      const rawEn = a.STREET_ENAME?.trim();
      const rawZh = a.STREET_CNAME?.trim();
      const hasEn = !isUnnamedName(rawEn);
      const hasZh = !isUnnamedName(rawZh);
      const name = hasZh ? rawZh! : (hasEn ? rawEn! : (routeNum ? `${routeNum}號幹線` : '路段'));
      const nameEn = hasEn ? rawEn! : (hasZh ? rawZh! : (routeNum ? `Route ${routeNum}` : 'Road segment'));
      const existing = geometry.get(routeId);
      if (!existing || existing.path.length < path.length) {
        geometry.set(routeId, { name, nameEn, routeNum, direction: a.TRAVEL_DIRECTION, path });
      }
    }
  }
  const missing = ids.filter(id => !geometry.has(id));
  if (missing.length) console.warn(`[flow-segments] ${missing.length} segment IDs have no geometry in the official road network; skipped: ${missing.slice(0, 10).join(',')}`);
  segmentGeometryCache = { expires: Date.now() + segmentGeometryTtl, map: geometry };
  return geometry;
}

async function getSegmentGeometry(routeIds: Iterable<number>): Promise<Map<number, SegmentGeometry>> {
  if (segmentGeometryCache && segmentGeometryCache.expires > Date.now()) return segmentGeometryCache.map;
  if (segmentGeometryRefresh) return segmentGeometryRefresh;
  segmentGeometryRefresh = fetchSegmentGeometry(routeIds).finally(() => { segmentGeometryRefresh = null; });
  return segmentGeometryRefresh;
}

async function loadFlow(): Promise<CameraData> {
  const [infoResponse, rawResponse] = await Promise.all([
    officialFetch(detectorInfoUrl, { allowedRedirectHosts: ['static.data.gov.hk'] }),
    officialFetch(rawSpeedUrl, { allowedRedirectHosts: ['resource.data.one.gov.hk'] }),
  ]);
  const rows = parseCsv((await infoResponse.text()).replace(/^﻿/, ''));
  const header = rows.shift()?.map(cell => cell.trim().toLowerCase());
  if (!header?.includes('aid_id_number') || !header.includes('latitude') || !header.includes('longitude')) throw new Error('官方探測器位置名冊格式不符。');
  const column = (name: string) => header.indexOf(name.toLowerCase());
  const raw = parser.parse(await rawResponse.text())?.['raw_speed_volume_list'];
  const latest = pickLatestPeriod(raw?.periods?.period);
  const detectors = latest?.detectors?.detector;
  if (!detectors) throw new Error('官方車速數據格式不符或未提供資料。');
  const detectorRows = (Array.isArray(detectors) ? detectors : [detectors]) as { detector_id: string; lanes?: { lane?: unknown } }[];
  const speedByDetector = new Map<string, number | null>();
  for (const detector of detectorRows) {
    const laneRaw = (detector.lanes as { lane?: unknown } | undefined)?.lane;
    const laneRows = (Array.isArray(laneRaw) ? laneRaw : laneRaw ? [laneRaw] : []) as { speed?: string; valid?: string }[];
    const validSpeeds = laneRows.filter(lane => String(lane.valid).toUpperCase() === 'Y').map(lane => Number(lane.speed)).filter(Number.isFinite);
    speedByDetector.set(String(detector.detector_id), validSpeeds.length ? validSpeeds.reduce((sum, value) => sum + value, 0) / validSpeeds.length : null);
  }
  const cameras: Camera[] = [];
  for (const row of rows) {
    const id = row[column('aid_id_number')]?.trim();
    const lat = Number(row[column('latitude')]);
    const lng = Number(row[column('longitude')]);
    const name = row[column('road_tc')]?.trim();
    const nameEn = row[column('road_en')]?.trim();
    if (!id || !name || !inHongKong(lat, lng)) continue;
    const speed = speedByDetector.has(id) ? speedByDetector.get(id)! : null;
    const level = speedLevel(speed);
    cameras.push({
      id: `flow-${id}`, sourceId: id, kind: 'flow', name, nameEn, lat, lng,
      district: row[column('district')]?.trim() || undefined,
      remarks: row[column('direction')]?.trim() || undefined,
      rotation: Number(row[column('rotation')]) || undefined,
      speedKmh: speed === null ? null : Math.round(speed), level, color: speedLevelColors[level],
      dataUpdated: latest?.period_to ? `${raw.date}T${latest.period_to}+08:00` : undefined,
    });
  }
  if (!cameras.length) throw new Error('官方探測器位置名冊暫無可用位置。');
  const invalid = cameras.filter(c => !c.name || !inHongKong(c.lat, c.lng));
  if (invalid.length) throw new Error(`官方車速資料有 ${invalid.length} 筆座標不完整。`);

  const segmentResult = await (async (): Promise<{ segments: FlowSegment[]; segmentsUpdated?: string } | undefined> => {
    try {
      const { byId, updated } = await loadSegmentSpeeds();
      const geometries = await getSegmentGeometry([...byId.keys()]);
      const segments: FlowSegment[] = [];
      for (const [routeId, info] of byId) {
        const geom = geometries.get(routeId);
        if (!geom) continue;
        const speedKmh = info.valid ? Math.round(info.speed) : null;
        const level = info.valid ? speedLevel(info.speed) : 'unknown';
        segments.push({ id: `flow-segment-${routeId}`, routeId, name: geom.name, nameEn: geom.nameEn, routeNum: geom.routeNum, direction: geom.direction, speedKmh, level, path: geom.path });
      }
      return { segments, segmentsUpdated: updated };
    } catch (error) {
      console.error('Failed to load flow segment data:', error);
      return undefined;
    }
  })();

  return { cameras, count: cameras.length, expectedCount: rows.length, complete: true, fetchedAt: new Date().toISOString(), sourceLastModified: infoResponse.headers.get('Last-Modified'), source: rawSpeedUrl, ...segmentResult };
}

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
const roadPattern = /\b([A-Z][A-Za-z0-9'.-]*(?:\s+[A-Z][A-Za-z0-9'.-]*){0,4}\s+(?:Road|Street|Avenue|Boulevard|Highway|Expressway|Tunnel|Bridge|Flyover|Path|Lane|Drive|Terrace|Circuit|Underpass|Interchange)(?:\s*-\s*[A-Za-z' ]{2,25})?)/g;

async function geocodeRoad(name: string): Promise<{ lat: number; lng: number } | null> {
  const key = name.trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  let result: { lat: number; lng: number } | null = null;
  try {
    const response = await officialFetch(`${alsLookupUrl}?q=${encodeURIComponent(key)}&n=1`, { allowedRedirectHosts: ['www.als.gov.hk'] });
    const text = await response.text();
    // ALS answers JSON when asked, otherwise XML; accept both.
    const parsed = text.trimStart().startsWith('{') ? JSON.parse(text) : parser.parse(text)?.AddressLookupResult;
    const raw = (parsed as { SuggestedAddress?: unknown })?.SuggestedAddress;
    const suggestions = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { ValidationInformation?: { Score?: number | string }; Address?: { PremisesAddress?: { GeospatialInformation?: { Latitude?: string; Longitude?: string } } } }[];
    const suggestion = suggestions[0];
    const geo = suggestion?.Address?.PremisesAddress?.GeospatialInformation;
    const lat = Number(geo?.Latitude);
    const lng = Number(geo?.Longitude);
    if ((Number(suggestion?.ValidationInformation?.Score) || 0) >= 50 && inHongKong(lat, lng)) result = { lat, lng };
  } catch {
    // Geocoding is best-effort; incidents without a confident match stay list-only.
  }
  geocodeCache.set(key, result);
  return result;
}

function parseNewsTime(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const match = value.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+([上下]午)?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!match) return new Date().toISOString();
  let hour = Number(match[5]);
  if (match[4] === '下午' && hour < 12) hour += 12;
  if (match[4] === '上午' && hour === 12) hour = 0;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T${String(hour).padStart(2, '0')}:${match[6]}:${match[7]}+08:00`;
}

async function loadIncidents(): Promise<CameraData> {
  const response = await officialFetch(speedNewsUrl, { allowedRedirectHosts: ['resource.data.one.gov.hk'] });
  const raw = parser.parse(await response.text())?.body?.message;
  const messages = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { msgID: string | number; ChinText?: string; EngText?: string; ChinShort?: string; EngShort?: string; ReferenceDate?: string }[];
  const cameras: Camera[] = [];
  const notices: IncidentNotice[] = [];
  for (const message of messages) {
    const id = String(message.msgID);
    const text = (message.ChinText ?? message.ChinShort ?? '').trim();
    const textEn = (message.EngText ?? message.EngShort ?? '').trim();
    if (!text && !textEn) continue;
    const time = parseNewsTime(message.ReferenceDate);
    const candidates = [...new Set([...textEn.matchAll(roadPattern)].map(match => match[1].trim()).filter(name => name.length > 4).slice(0, 3))];
    let location: { lat: number; lng: number } | null = null;
    let matchedRoad = '';
    for (const candidate of candidates) {
      location = await geocodeRoad(candidate);
      if (location) { matchedRoad = candidate; break; }
    }
    const notice: IncidentNotice = { id: `incident-${id}`, text, textEn, time, located: Boolean(location) };
    if (location) {
      const cameraId = `incident-${id}`;
      notice.cameraId = cameraId;
      cameras.push({
        id: cameraId, sourceId: id, kind: 'incident',
        name: text.split('\n')[0].slice(0, 60) || matchedRoad, nameEn: textEn.split('\n')[0].slice(0, 60) || matchedRoad,
        lat: location.lat, lng: location.lng, text, textEn,
        remarks: matchedRoad ? `≈ ${matchedRoad}` : undefined, dataUpdated: time,
      });
    }
    notices.push(notice);
  }
  return { cameras, count: cameras.length, expectedCount: notices.length, complete: true, fetchedAt: new Date().toISOString(), sourceLastModified: response.headers.get('Last-Modified'), source: speedNewsUrl, notices };
}

type ParkingInfo = { park_Id: string; name?: string; displayAddress?: string; latitude?: number | string; longitude?: number | string; opening_status?: string; heightLimits?: { height?: number | string }[]; district?: string; nature?: string; carpark_Type?: string };
type ParkingVacancy = { park_Id: string; privateCar?: { vacancy?: number | string; lastupdate?: string }[] };

async function loadParking(): Promise<CameraData> {
  const [infoEn, infoZh, vacancy] = await Promise.all([
    officialFetch(`${parkingBaseUrl}?data=info&lang=en_US`, { allowedRedirectHosts: ['api.data.gov.hk'] }),
    officialFetch(`${parkingBaseUrl}?data=info&lang=zh_HK`, { allowedRedirectHosts: ['api.data.gov.hk'] }).catch(() => null),
    officialFetch(`${parkingBaseUrl}?data=vacancy&lang=en_US`, { allowedRedirectHosts: ['api.data.gov.hk'] }),
  ]);
  const infoRows = ((await infoEn.json()) as { results?: ParkingInfo[] }).results;
  if (!Array.isArray(infoRows) || !infoRows.length) throw new Error('官方停車場名冊格式不符或未提供資料。');
  let zhNames = new Map<string, ParkingInfo>();
  if (infoZh) {
    try {
      const zhRows = ((await infoZh.json()) as { results?: ParkingInfo[] }).results ?? [];
      zhNames = new Map(zhRows.map(row => [row.park_Id, row]));
    } catch {
      // English names remain available if the optional Chinese feed is malformed.
    }
  }
  const vacancyByPark = new Map(((await vacancy.json()) as { results?: ParkingVacancy[] }).results?.map(row => [row.park_Id, row.privateCar?.[0]]) ?? []);
  const cameras: Camera[] = [];
  for (const row of infoRows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!row.park_Id || !inHongKong(lat, lng)) continue;
    const live = vacancyByPark.get(row.park_Id);
    const vacancyCount = live && live.vacancy !== undefined && live.vacancy !== null && Number(live.vacancy) >= 0 ? Number(live.vacancy) : null;
    const zh = zhNames.get(row.park_Id);
    cameras.push({
      id: `parking-${row.park_Id}`, sourceId: row.park_Id, kind: 'parking',
      name: zh?.name || row.name || row.park_Id, nameEn: row.name,
      lat, lng, district: row.district || undefined,
      remarks: (zh?.displayAddress || row.displayAddress || '').trim() || undefined,
      vacancy: vacancyCount, heightLimit: Number(row.heightLimits?.[0]?.height) || undefined,
      openingStatus: row.opening_status || undefined, dataUpdated: live?.lastupdate?.replace(' ', 'T') ? `${live.lastupdate.replace(' ', 'T')}+08:00` : undefined,
    });
  }
  if (!cameras.length) throw new Error('官方停車場名冊暫無可用位置。');
  return { cameras, count: cameras.length, expectedCount: infoRows.length, complete: true, fetchedAt: new Date().toISOString(), sourceLastModified: null, source: parkingBaseUrl };
}

// HKO publishes district-level hourly rainfall without station coordinates; these are
// district reference points used solely to position the district reading on the map.
const districtReferencePoints: Record<string, { lat: number; lng: number; zh: string }> = {
  'Central & Western District': { lat: 22.286, lng: 114.154, zh: '中西區' },
  'Wan Chai': { lat: 22.277, lng: 114.175, zh: '灣仔' },
  'Eastern District': { lat: 22.283, lng: 114.224, zh: '東區' },
  'Southern District': { lat: 22.246, lng: 114.171, zh: '南區' },
  'Yau Tsim Mong': { lat: 22.310, lng: 114.170, zh: '油尖旺' },
  'Sham Shui Po': { lat: 22.330, lng: 114.162, zh: '深水埗' },
  'Kowloon City': { lat: 22.329, lng: 114.190, zh: '九龍城' },
  'Wong Tai Sin': { lat: 22.341, lng: 114.196, zh: '黃大仙' },
  'Kwun Tong': { lat: 22.313, lng: 114.226, zh: '觀塘' },
  'Kwai Tsing': { lat: 22.357, lng: 114.132, zh: '葵青' },
  'Tsuen Wan': { lat: 22.371, lng: 114.113, zh: '荃灣' },
  'Tuen Mun': { lat: 22.394, lng: 113.973, zh: '屯門' },
  'Yuen Long': { lat: 22.445, lng: 114.034, zh: '元朗' },
  'North District': { lat: 22.497, lng: 114.138, zh: '北區' },
  'Tai Po': { lat: 22.450, lng: 114.166, zh: '大埔' },
  'Sha Tin': { lat: 22.382, lng: 114.190, zh: '沙田' },
  'Sai Kung': { lat: 22.383, lng: 114.271, zh: '西貢' },
  'Islands District': { lat: 22.261, lng: 113.946, zh: '離島' },
};
type RainfallReading = { place?: string; max?: number | string; main?: string };

async function loadRainfall(): Promise<CameraData> {
  const [responseEn, responseZh] = await Promise.all([
    officialFetch(rainfallUrl('en'), { allowedRedirectHosts: ['data.weather.gov.hk'] }),
    officialFetch(rainfallUrl('tc'), { allowedRedirectHosts: ['data.weather.gov.hk'] }).catch(() => null),
  ]);
  const bodyEn = await responseEn.json() as { rainfall?: { data?: RainfallReading[]; startTime?: string; endTime?: string } };
  const rows = bodyEn.rainfall?.data;
  if (!Array.isArray(rows) || !rows.length) throw new Error('官方雨量數據格式不符或未提供資料。');
  let zhPlaces: string[] = [];
  if (responseZh) {
    try {
      const bodyZh = await responseZh.json() as { rainfall?: { data?: RainfallReading[] } };
      zhPlaces = bodyZh.rainfall?.data?.map(row => row.place ?? '') ?? [];
    } catch {
      // The curated Chinese district names remain available.
    }
  }
  const cameras: Camera[] = [];
  rows.forEach((row, index) => {
    const point = row.place ? districtReferencePoints[row.place] : undefined;
    if (!point || !row.place) return;
    const mm = Number(row.max);
    if (!Number.isFinite(mm)) return;
    const maintained = String(row.main).toUpperCase() === 'TRUE';
    cameras.push({
      id: `rainfall-${row.place.replace(/[^A-Za-z]+/g, '-').toLowerCase()}`, sourceId: row.place, kind: 'rainfall',
      name: zhPlaces[index] || point.zh, nameEn: row.place, lat: point.lat, lng: point.lng,
      rainfallMm: mm, dataUpdated: bodyEn.rainfall?.endTime,
      remarks: maintained ? 'M' : undefined,
    });
  });
  if (!cameras.length) throw new Error('官方雨量數據暫無可用分區。');
  return { cameras, count: cameras.length, expectedCount: rows.length, complete: true, fetchedAt: new Date().toISOString(), sourceLastModified: null, source: rainfallUrl('en') };
}

const cacheTtl: Record<LayerKind, number> = { redlight: 300000, speed: 300000, snapshot: 300000, flow: 120000, incident: 120000, parking: 180000, rainfall: 600000 };

export async function getCameraData(kind: LayerKind): Promise<CameraData> {
  const entry = cached.get(kind);
  if (entry && entry.expires > Date.now()) return entry.data;
  const existing = pending.get(kind);
  if (existing) return existing;
  const load = kind === 'snapshot' ? loadSnapshots()
    : kind === 'flow' ? loadFlow()
    : kind === 'incident' ? loadIncidents()
    : kind === 'parking' ? loadParking()
    : kind === 'rainfall' ? loadRainfall()
    : loadEnforcement(kind);
  const task = load.then(data => {
    cached.set(kind, { expires: Date.now() + cacheTtl[kind], data }); return data;
  }).finally(() => pending.delete(kind));
  pending.set(kind, task);
  return task;
}
