export type LayerKind = 'redlight' | 'speed' | 'snapshot';
export type Camera = {
  id: string; sourceId: string; kind: LayerKind; name: string; nameEn?: string;
  lat: number; lng: number; district?: string; region?: string; remarks?: string;
  sourceUpdated?: string; imageUrl?: string;
};
export type CameraData = {
  cameras: Camera[]; count: number; expectedCount: number; fetchedAt: string;
  sourceLastModified: string | null; source: string; complete: boolean;
};
export const kinds: LayerKind[] = ['redlight', 'speed', 'snapshot'];
export const layers = {
  redlight: { name: '衝紅燈攝影機', short: '衝紅燈', caption: '裝設攝影機系統的路口', color: '#e15d69', dataset: 'td_rcd_1671693287017_1644', source: 'https://data.gov.hk/tc-data/dataset/hk-td-tis_25-junctions-with-rlc' },
  speed: { name: '偵速攝影機', short: '偵速', caption: '偵速攝影機機箱位置', color: '#d49b25', dataset: 'td_rcd_1671693428549_89372', source: 'https://data.gov.hk/tc-data/dataset/hk-td-tis_26-locations-of-sec' },
  snapshot: { name: '交通快拍', short: '交通快拍', caption: '運輸署最新道路影像', color: '#318dbe', dataset: '', source: 'https://data.gov.hk/tc-data/dataset/hk-td-tis_2-traffic-snapshot-images' },
};
export const snapshotInventory = 'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml';
export const featureService = (kind: 'redlight' | 'speed') => `https://portal.csdi.gov.hk/server/rest/services/common/${layers[kind].dataset}/FeatureServer/0`;
export function hkTime(value: string | number, date = false) {
  return new Intl.DateTimeFormat('zh-HK', { timeZone: 'Asia/Hong_Kong', ...(date ? { month: '2-digit', day: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}
