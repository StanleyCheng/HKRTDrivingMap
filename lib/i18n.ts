import type { Language, LayerKind } from './traffic';

type AppMessages = {
  languageControl: string;
  english: string;
  chinese: string;
  brandTitle: string;
  brandSubtitle: string;
  officialData: string;
  sources: string;
  sidebarLabel: string;
  overviewEyebrow: string;
  overviewTitle: string;
  publishedLocations: string;
  completeInventory: string;
  mapLayers: string;
  showingLocations: (count: string) => string;
  layerSwitch: (name: string) => string;
  layerUpdateFailed: string;
  dataLoadFailed: string;
  retry: string;
  noOfficialLocations: string;
  layerNote: string;
  cameraDetails: string;
  closeCameraDetails: string;
  district: string;
  coordinates: string;
  recordUpdated: string;
  officialRemarks: string;
  layerDetail: Record<'redlight' | 'speed', string>;
  officialSource: string;
  emptyDetailTitle: string;
  emptyDetailBody: string;
  loadingOfficialData: string;
  partialUpdateFailure: string;
  inventoryFetched: (time: string) => string;
  noData: string;
  refreshAll: string;
  openControls: string;
  closeControls: string;
  panelTitle: string;
  sourceDialogTitle: string;
  closeSources: string;
  sourceDescriptions: Record<LayerKind, string>;
  dataGovLink: string;
  locationXml: string;
  officialApi: string;
  sourceChecked: (count: string, expected: string, time: string, stale: boolean) => string;
  sourceFootnote: string;
  basemap: string;
  osmContributors: string;
  nonGovernmentBasemap: string;
  governmentTerms: string;
  snapshotAlt: (name: string) => string;
  snapshotTimeout: string;
  snapshotDisplayFailed: string;
  loadingSnapshot: string;
  reloadSnapshot: string;
  snapshotUpdated: (time: string) => string;
  snapshotNoUpdateTime: string;
  snapshotWaiting: string;
  refreshSnapshot: string;
  snapshotStale: string;
  snapshotNote: string;
  mapLabel: string;
  mapKeyboardHelp: string;
  mapTitle: string;
  inView: (count: string) => string;
  zoomIn: string;
  zoomOut: string;
  showAll: string;
  returnToHongKong: string;
  mapLoadFailed: string;
  mapLoading: string;
  allLayersOff: string;
  cameraLoadFailed: string;
  noCameraLocations: string;
  turnOnLayer: string;
  checkLayers: string;
  mapHint: string;
  clusterLabel: (count: number) => string;
};

export const messages: Record<Language, AppMessages> = {
  zh: {
    languageControl: '語言選擇', english: '英文', chinese: '中文',
    brandTitle: '香港實時交通資訊', brandSubtitle: '香港即時交通監察',
    officialData: '官方開放數據', sources: '資料來源', sidebarLabel: '相機圖層及詳情',
    overviewEyebrow: '香港 · 交通概覽', overviewTitle: '全港相機一覽', publishedLocations: '個已公布位置',
    completeInventory: '完整名冊', mapLayers: '地圖圖層', showingLocations: count => `顯示 ${count} 個`,
    layerSwitch: name => `${name}圖層`, layerUpdateFailed: '更新失敗，現顯示上次成功載入的名冊。', dataLoadFailed: '資料載入失敗。',
    retry: '重試', noOfficialLocations: '官方名冊暫無位置資料。',
    layerNote: '數字代表官方公布的位置數目，並非正在運作的相機數量。偵速機箱名冊不包括政府隧道及管制區。',
    cameraDetails: '相機詳情', closeCameraDetails: '關閉相機詳情', district: '所屬地區', coordinates: '位置座標',
    recordUpdated: '記錄更新', officialRemarks: '官方備註',
    layerDetail: {
      redlight: '此圖層提供衝紅燈攝影機系統路口位置。官方並無提供此相機的即時運作狀態或快拍影像。',
      speed: '此圖層提供偵速攝影機機箱位置。官方並無提供此相機的即時運作狀態或快拍影像。',
    },
    officialSource: '運輸署 · 官方資料來源', emptyDetailTitle: '每段路況，一目了然',
    emptyDetailBody: '點選地圖上的相機標記，查看位置詳情或最新交通快拍。',
    loadingOfficialData: '正在讀取官方資料…', partialUpdateFailure: '部分資料更新失敗',
    inventoryFetched: time => `名冊讀取 ${time}`, noData: '未有可用資料', refreshAll: '重新讀取所有官方名冊',
    openControls: '開啟圖層及詳情', closeControls: '關閉圖層及詳情', panelTitle: '圖層及詳情',
    sourceDialogTitle: '資料來源與更新', closeSources: '關閉資料來源',
    sourceDescriptions: {
      redlight: '運輸署於空間數據共享平台（CSDI）公布的裝設衝紅燈攝影機系統路口。先查詢全部記錄編號及總數，再分批取得每個位置，並核對完整性。位置名冊按官方資料更新。',
      speed: '運輸署於空間數據共享平台（CSDI）公布的偵速機箱位置（不包括政府隧道及管制區）。先查詢全部記錄編號及總數，再分批取得每個位置，並核對完整性。位置名冊按官方資料更新。',
      snapshot: '運輸署交通快拍完整位置名冊（XML）及官方 JPEG 影像。已選快拍每兩分鐘重新讀取，時間取自影像回應的 Last-Modified。',
    },
    dataGovLink: '資料一線通', locationXml: '完整位置 XML', officialApi: 'CSDI 官方 API',
    sourceChecked: (count, expected, time, stale) => `已核對 ${count} / ${expected} 筆 · ${time} 讀取${stale ? '（更新失敗，保留上次名冊）' : ''}`,
    sourceFootnote: '所有位置及交通影像均取自香港政府，沒有模擬交通資料。名冊每五分鐘重新讀取。快拍為定時更新的靜態影像，並非直播；官方可能回傳「No Service」影像。本網站不代表香港特別行政區政府。',
    basemap: '底圖：', osmContributors: 'OpenStreetMap 貢獻者', nonGovernmentBasemap: '（非政府底圖）。', governmentTerms: '政府開放數據使用條款',
    snapshotAlt: name => `${name}的官方交通快拍`,
    snapshotTimeout: '快拍載入逾時，請重試。', snapshotDisplayFailed: '影像無法顯示，請重試。',
    loadingSnapshot: '載入最新快拍', reloadSnapshot: '重新載入快拍', snapshotUpdated: time => `影像更新 ${time}`,
    snapshotNoUpdateTime: '來源未提供影像更新時間', snapshotWaiting: '等待官方影像', refreshSnapshot: '更新快拍',
    snapshotStale: '此影像已超過 10 分鐘未更新，可能暫停服務。',
    snapshotNote: '每 2 分鐘自動重新讀取 · 香港時間\n更新時間取自官方影像檔案；拍攝時間以圖中標示為準。若顯示「No Service」，代表官方暫未提供影像。',
    mapLabel: '香港相機位置互動地圖', mapKeyboardHelp: '使用方向鍵移動地圖，點選數字群組放大',
    mapTitle: '全港交通地圖', inView: count => `範圍內 ${count} 個位置`, zoomIn: '放大地圖', zoomOut: '縮小地圖',
    showAll: '顯示全部相機位置', returnToHongKong: '返回全港',
    mapLoadFailed: '互動地圖或底圖暫時未能完整載入。相機位置資料不受影響，請檢查網絡或重新載入。',
    mapLoading: '正在載入地圖', allLayersOff: '所有圖層已關閉', cameraLoadFailed: '暫時未能載入相機位置',
    noCameraLocations: '暫無相機位置資料', turnOnLayer: '開啟相機圖層，即可在地圖查看位置。',
    checkLayers: '請查看圖層狀態，並按重新整理再試。', mapHint: '點選相機查看詳情 · 點選數字展開相機群組',
    clusterLabel: count => `${count} 個相機位置，按下展開`,
  },
  en: {
    languageControl: 'Language', english: 'English', chinese: 'Chinese',
    brandTitle: 'Hong Kong Real-Time Traffic', brandSubtitle: 'LIVE OFFICIAL CAMERA MAP',
    officialData: 'Official open data', sources: 'Sources', sidebarLabel: 'Camera layers and details',
    overviewEyebrow: 'HONG KONG · TRAFFIC OVERVIEW', overviewTitle: 'Camera overview', publishedLocations: 'published locations',
    completeInventory: 'Complete list', mapLayers: 'Map layers', showingLocations: count => `Showing ${count}`,
    layerSwitch: name => `${name} layer`, layerUpdateFailed: 'Update failed. Showing the last successfully loaded list.', dataLoadFailed: 'Data could not be loaded.',
    retry: 'Retry', noOfficialLocations: 'The official list currently has no location data.',
    layerNote: 'Counts are published locations, not cameras confirmed to be operating. The speed-camera list excludes government tunnels and control areas.',
    cameraDetails: 'Camera details', closeCameraDetails: 'Close camera details', district: 'District', coordinates: 'Coordinates',
    recordUpdated: 'Record updated', officialRemarks: 'Official remarks',
    layerDetail: {
      redlight: 'This layer shows red-light camera junctions. The official source does not provide live operating status or snapshot images for these cameras.',
      speed: 'This layer shows speed-camera housing locations. The official source does not provide live operating status or snapshot images for these cameras.',
    },
    officialSource: 'Transport Department · Official source', emptyDetailTitle: 'See every road at a glance',
    emptyDetailBody: 'Select a camera marker on the map to view its location details or latest traffic snapshot.',
    loadingOfficialData: 'Loading official data…', partialUpdateFailure: 'Some data failed to update',
    inventoryFetched: time => `List fetched ${time}`, noData: 'No data available', refreshAll: 'Reload all official lists',
    openControls: 'Open layers and details', closeControls: 'Close layers and details', panelTitle: 'Layers and details',
    sourceDialogTitle: 'Sources and updates', closeSources: 'Close sources',
    sourceDescriptions: {
      redlight: 'Red-light camera junctions published by the Transport Department on the Common Spatial Data Infrastructure (CSDI). The app queries every record ID and the total count, loads locations in batches, and verifies completeness.',
      speed: 'Speed-camera housing locations published by the Transport Department on CSDI, excluding government tunnels and control areas. The app queries every record ID and the total count, loads locations in batches, and verifies completeness.',
      snapshot: 'The Transport Department’s complete traffic-snapshot location list (XML) and official JPEG images. The selected snapshot refreshes every two minutes; update time comes from the image response’s Last-Modified value.',
    },
    dataGovLink: 'DATA.GOV.HK', locationXml: 'Complete location XML', officialApi: 'Official CSDI API',
    sourceChecked: (count, expected, time, stale) => `Verified ${count} / ${expected} records · fetched ${time}${stale ? ' (update failed; last list retained)' : ''}`,
    sourceFootnote: 'All locations and traffic images come from the Hong Kong Government; no traffic data is simulated. Location lists refresh every five minutes. Snapshots are periodically updated still images, not live video, and the official source may return a “No Service” image. This website does not represent the Government of the Hong Kong SAR.',
    basemap: 'Basemap: ', osmContributors: 'OpenStreetMap contributors', nonGovernmentBasemap: ' (non-government basemap). ', governmentTerms: 'Government open-data terms',
    snapshotAlt: name => `Official traffic snapshot for ${name}`,
    snapshotTimeout: 'The snapshot timed out. Please retry.', snapshotDisplayFailed: 'The image could not be displayed. Please retry.',
    loadingSnapshot: 'Loading latest snapshot', reloadSnapshot: 'Reload snapshot', snapshotUpdated: time => `Image updated ${time}`,
    snapshotNoUpdateTime: 'The source did not provide an image update time', snapshotWaiting: 'Waiting for official image', refreshSnapshot: 'Refresh snapshot',
    snapshotStale: 'This image has not updated for more than 10 minutes and may be temporarily unavailable.',
    snapshotNote: 'Automatically refreshed every 2 minutes · Hong Kong time\nUpdate time comes from the official image file; see the image for its capture time. “No Service” means the official source has no image available.',
    mapLabel: 'Interactive map of Hong Kong camera locations', mapKeyboardHelp: 'Use arrow keys to move the map and select a numbered cluster to zoom in',
    mapTitle: 'Hong Kong traffic map', inView: count => `${count} locations in view`, zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    showAll: 'Show all camera locations', returnToHongKong: 'Return to all Hong Kong',
    mapLoadFailed: 'The interactive map or basemap could not fully load. Camera location data is unaffected; check your connection or reload.',
    mapLoading: 'Loading map', allLayersOff: 'All layers are off', cameraLoadFailed: 'Camera locations could not be loaded',
    noCameraLocations: 'No camera location data is available', turnOnLayer: 'Turn on a camera layer to see its locations on the map.',
    checkLayers: 'Check the layer status, then refresh and try again.', mapHint: 'Select a camera for details · Select a number to expand a cluster',
    clusterLabel: count => `${count} camera locations; select to expand`,
  },
};

export function formatRecordDate(value: string, language: Language) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return value;
  return language === 'zh' ? `${match[1]}年${match[2]}月${match[3]}日` : `${match[1]}-${match[2]}-${match[3]}`;
}
