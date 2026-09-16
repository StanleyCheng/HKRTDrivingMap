import { XMLParser } from 'fast-xml-parser';
import { Camera, CameraData, LayerKind, featureService, snapshotInventory } from './traffic';

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, processEntities: true });
const cached = new Map<LayerKind, { expires: number; data: CameraData }>();
const pending = new Map<LayerKind, Promise<CameraData>>();
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxOfficialRedirects = 3;
type OfficialFetchOptions = { allowedRedirectHosts?: readonly string[] };

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
  const response = await officialFetch(snapshotInventory, { allowedRedirectHosts: ['static.data.gov.hk'] });
  const raw = parser.parse(await response.text())?.['image-list']?.image;
  if (!raw) throw new Error('官方快拍名冊格式不符或未提供資料。');
  const rows = Array.isArray(raw) ? raw : [raw];
  const cameras: Camera[] = rows.map(row => ({ id: `snapshot-${row.key}`, sourceId: row.key, kind: 'snapshot', name: row.description?.replace(/\s*\[[^\]]+\]$/, ''), lat: Number(row.latitude), lng: Number(row.longitude), district: row.district, region: row.region, imageUrl: row.url }));
  validate(cameras, rows.length);
  return { cameras, count: cameras.length, expectedCount: rows.length, complete: true, fetchedAt: new Date().toISOString(), sourceLastModified: response.headers.get('Last-Modified'), source: snapshotInventory };
}
export async function getCameraData(kind: LayerKind): Promise<CameraData> {
  const entry = cached.get(kind);
  if (entry && entry.expires > Date.now()) return entry.data;
  const existing = pending.get(kind);
  if (existing) return existing;
  const task = (kind === 'snapshot' ? loadSnapshots() : loadEnforcement(kind)).then(data => {
    cached.set(kind, { expires: Date.now() + 300000, data }); return data;
  }).finally(() => pending.delete(kind));
  pending.set(kind, task);
  return task;
}
