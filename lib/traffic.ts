export type LayerKind = 'redlight' | 'speed' | 'snapshot' | 'flow' | 'incident' | 'parking' | 'rainfall';
export type Language = 'en' | 'zh';
export type SpeedLevel = 'free' | 'moderate' | 'slow' | 'unknown';
export type Camera = {
  id: string; sourceId: string; kind: LayerKind; name: string; nameEn?: string;
  lat: number; lng: number; district?: string; districtEn?: string; region?: string; regionEn?: string; remarks?: string;
  sourceUpdated?: string; imageUrl?: string;
  color?: string; rotation?: number;
  level?: SpeedLevel; speedKmh?: number | null;
  vacancy?: number | null; heightLimit?: number; openingStatus?: string;
  rainfallMm?: number;
  text?: string; textEn?: string;
  dataUpdated?: string;
};
export type IncidentNotice = { id: string; text: string; textEn: string; time: string; located: boolean; cameraId?: string };
export type CameraData = {
  cameras: Camera[]; count: number; expectedCount: number; fetchedAt: string;
  sourceLastModified: string | null; source: string; complete: boolean;
  notices?: IncidentNotice[];
};
export const kinds: LayerKind[] = ['flow', 'incident', 'redlight', 'speed', 'snapshot', 'parking', 'rainfall'];
export const layers = {
  redlight: { name: '衝紅燈攝影機', nameEn: 'Red-light cameras', short: '衝紅燈', shortEn: 'Red light', caption: '裝設攝影機系統的路口', captionEn: 'Camera-enforced junctions', color: '#e15d69', dataset: 'td_rcd_1671693287017_1644', source: 'https://data.gov.hk/tc-data/dataset/hk-td-tis_25-junctions-with-rlc' },
  speed: { name: '偵速攝影機', nameEn: 'Speed cameras', short: '偵速', shortEn: 'Speed', caption: '偵速攝影機機箱位置', captionEn: 'Speed camera housing locations', color: '#d49b25', dataset: 'td_rcd_1671693428549_89372', source: 'https://data.gov.hk/tc-data/dataset/hk-td-tis_26-locations-of-sec' },
  snapshot: { name: '交通快拍', nameEn: 'Traffic snapshots', short: '交通快拍', shortEn: 'Snapshots', caption: '運輸署最新道路影像', captionEn: 'Latest Transport Department images', color: '#318dbe', dataset: '', source: 'https://data.gov.hk/tc-data/dataset/hk-td-tis_2-traffic-snapshot-images' },
  flow: { name: '實時車速', nameEn: 'Live road speed', short: '車速', shortEn: 'Flow', caption: '主要道路探測器每 1–2 分鐘更新', captionEn: 'Major-road detectors, every 1–2 min', color: '#1f9d63', dataset: '', source: 'https://data.gov.hk/en-data/dataset/hk-td-sm_4-traffic-data-strategic-major-roads' },
  incident: { name: '特別交通消息', nameEn: 'Traffic incidents', short: '事故', shortEn: 'Incidents', caption: '事故、封路及緊急工程', captionEn: 'Accidents, closures and emergency works', color: '#e8842c', dataset: '', source: 'https://data.gov.hk/en-data/dataset/hk-td-tis_19-special-traffic-news-v2' },
  parking: { name: '停車場空位', nameEn: 'Parking vacancy', short: '泊車', shortEn: 'Parking', caption: '實時泊車空位及高度限制', captionEn: 'Real-time spaces and height limits', color: '#7b5fc9', dataset: '', source: 'https://data.gov.hk/en-data/dataset/hk-dpo-datagovhk1-carpark-info-vacancy' },
  rainfall: { name: '降雨量', nameEn: 'Rainfall', short: '雨量', shortEn: 'Rain', caption: '天文台分區每小時雨量', captionEn: 'HKO district hourly rainfall', color: '#5a8fd6', dataset: '', source: 'https://data.gov.hk/en-data/dataset/hk-hko-rss-rainfall-in-the-past-hour' },
};
export const speedLevelColors: Record<SpeedLevel, string> = { free: '#1f9d63', moderate: '#d49b25', slow: '#e15d69', unknown: '#8a9aa5' };
export function layerText(kind: LayerKind, language: Language) {
  const layer = layers[kind];
  return language === 'en'
    ? { name: layer.nameEn, short: layer.shortEn, caption: layer.captionEn }
    : { name: layer.name, short: layer.short, caption: layer.caption };
}
export const snapshotInventory = 'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml';
export const snapshotInventoryEn = 'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml';
export const featureService = (kind: 'redlight' | 'speed') => `https://portal.csdi.gov.hk/server/rest/services/common/${layers[kind].dataset}/FeatureServer/0`;
export function hkTime(value: string | number, date = false, language: Language = 'zh') {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-HK' : 'zh-HK', { timeZone: 'Asia/Hong_Kong', ...(date ? { month: '2-digit', day: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}
