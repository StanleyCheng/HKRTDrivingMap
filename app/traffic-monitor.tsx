'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Video, TrafficCone, Gauge, Layers, MapPin, ArrowUpRight, Info, RefreshCw, X, ShieldCheck, LoaderCircle, Clock3, Route } from 'lucide-react';
import { Camera, CameraData, LayerKind, kinds, layers, hkTime, featureService, snapshotInventory } from '@/lib/traffic';
import TrafficMap from './traffic-map';

type LayerState = { data?: CameraData; loading: boolean; error?: string };
type Snapshot = { imageUrl: string; updatedAt: string | null; fetchedAt: string };
const icons = { redlight: TrafficCone, speed: Gauge, snapshot: Video };
function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.name === 'TypeError') return '網絡連線失敗，請檢查連線後重試。';
  return error instanceof Error && error.name !== 'TimeoutError' ? error.message : fallback;
}

function SnapshotImage({ camera }: { camera: Camera }) {
  const [shot, setShot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true; setLoading(true); setError('');
      try {
        const r = await fetch(`/api/snapshot/${camera.sourceId}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]), cache: 'no-store' });
        if (!r.ok) {
          const data = await r.json() as { error?: string };
          throw new Error(data.error || '快拍未能載入。');
        }
        const blob = await r.blob();
        const imageUrl = URL.createObjectURL(blob);
        if (abort.signal.aborted) {
          URL.revokeObjectURL(imageUrl);
          return;
        }
        const modified = r.headers.get('Last-Modified');
        setShot({
          imageUrl,
          updatedAt: modified && !Number.isNaN(Date.parse(modified)) ? new Date(modified).toISOString() : null,
          fetchedAt: r.headers.get('X-Snapshot-Fetched-At') ?? new Date().toISOString(),
        });
      } catch (e) { if (!abort.signal.aborted) setError(errorMessage(e, '快拍載入逾時，請重試。')); }
      finally { busy = false; if (!abort.signal.aborted) setLoading(false); }
    }
    refresh();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 120000);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { abort.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [camera.sourceId, tick]);
  useEffect(() => {
    const imageUrl = shot?.imageUrl;
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [shot?.imageUrl]);
  const stale = Boolean(
    shot?.updatedAt &&
      Date.parse(shot.fetchedAt) - Date.parse(shot.updatedAt) > 10 * 60000,
  );
  return <>
    <div className="snapshot-frame">
      {shot && <Image src={shot.imageUrl} alt={`${camera.name}的官方交通快拍`} fill sizes="(max-width: 640px) 100vw, 300px" unoptimized onError={() => setError('影像無法顯示，請重試。')}/>}
      {loading && !shot && <div className="image-status"><LoaderCircle size={18} className="spin"/>載入最新快拍</div>}
      {error && <div className="image-status" role="alert"><div>{error}<br/><button className="text-button" onClick={() => setTick(t => t + 1)}>重新載入快拍</button></div></div>}
    </div>
    <div className="snapshot-meta"><span className={`image-update ${stale ? 'stale' : ''}`}><Clock3 size={12}/>{shot?.updatedAt ? `影像更新 ${hkTime(shot.updatedAt, true)}` : shot ? '來源未提供影像更新時間' : '等待官方影像'}</span><button className="refresh-image" title="更新快拍" aria-label="更新快拍" disabled={loading} onClick={() => setTick(t => t + 1)}><RefreshCw size={14} className={loading ? 'spin' : ''}/></button></div>
    {stale && <p className="subtle warning-text">此影像已超過 10 分鐘未更新，可能暫停服務。</p>}
    <p className="subtle">每 2 分鐘自動重新讀取 · 香港時間<br/>更新時間取自官方影像檔案；拍攝時間以圖中標示為準。若顯示「No Service」，代表官方暫未提供影像。</p>
  </>;
}
export default function TrafficMonitor() {
  const [enabled, setEnabled] = useState<Record<LayerKind, boolean>>({ redlight: true, speed: true, snapshot: true });
  const [states, setStates] = useState<Record<LayerKind, LayerState>>({ redlight: { loading: true }, speed: { loading: true }, snapshot: { loading: true } });
  const [selected, setSelected] = useState<Camera | null>(null);
  const details = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const inflight = useRef(new Set<LayerKind>());
  const fetchLayer = useCallback(async (kind: LayerKind) => {
    if (inflight.current.has(kind)) return;
    inflight.current.add(kind);
    setStates(s => ({ ...s, [kind]: { ...s[kind], loading: true, error: undefined } }));
    try {
      const response = await fetch(`/api/cameras/${kind}`, { signal: AbortSignal.timeout(90000), cache: 'no-store' });
      const data = await response.json() as CameraData & { error?: string };
      if (!response.ok) throw new Error(data.error || '資料載入失敗。');
      setStates(s => ({ ...s, [kind]: { data, loading: false } }));
    } catch (e) {
      setStates(s => ({ ...s, [kind]: { ...s[kind], loading: false, error: errorMessage(e, '連線逾時，請稍後重試。') } }));
    } finally { inflight.current.delete(kind); }
  }, []);
  useEffect(() => {
    kinds.forEach(k => fetchLayer(k));
    const interval = setInterval(() => { if (document.visibilityState === 'visible') kinds.forEach(k => fetchLayer(k)); }, 300000);
    return () => clearInterval(interval);
  }, [fetchLayer]);
  const cameras = useMemo(() => kinds.flatMap(k => enabled[k] ? states[k].data?.cameras ?? [] : []), [states, enabled]);
  const total = kinds.reduce((n, k) => n + (states[k].data?.count ?? 0), 0);
  const loading = kinds.some(k => states[k].loading);
  const errors = kinds.some(k => states[k].error);
  const complete = kinds.every(k => states[k].data?.complete) && !errors;
  const times = kinds.flatMap(k => states[k].data ? [states[k].data!.fetchedAt] : []).sort();
  const latest = times.at(-1);
  function toggle(kind: LayerKind) {
    setEnabled(e => ({ ...e, [kind]: !e[kind] }));
    if (selected?.kind === kind && enabled[kind]) setSelected(null);
  }
  const choose = useCallback((camera: Camera) => {
    setSelected(camera);
    setTimeout(() => details.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }), 80);
  }, []);
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Route size={25}/></div><div><h1>香港實時交通資訊</h1><p>HONG KONG REAL-TIME TRAFFIC MONITOR</p></div></div><div className="header-meta"><span className="official-tag"><ShieldCheck size={15}/>官方開放數據</span><button className="source-button" onClick={() => dialog.current?.showModal()}><Info size={16}/><span>資料來源</span></button></div></header>
    <div className="workspace">
      <aside className="sidebar" aria-label="相機圖層及詳情"><div className="sidebar-scroll">
        <p className="eyebrow">HONG KONG · TRAFFIC OVERVIEW</p>
        <div className="overview-heading"><h2>全港相機一覽</h2><Layers size={19}/></div>
        <div className="summary" aria-live="polite"><strong>{total ? total.toLocaleString() : loading ? '—' : '0'}</strong><span>個已公布位置</span>{complete && <small>完整名冊</small>}</div>
        <div className="section-label"><h3>地圖圖層</h3><span>顯示 {cameras.length.toLocaleString()} 個</span></div>
        <div className="layer-list">{kinds.map(kind => {
          const item = layers[kind], state = states[kind], Icon = icons[kind];
          return <div key={kind} className={`layer-card ${kind} ${enabled[kind] ? 'active' : ''}`}>
            <button className="layer-toggle" role="switch" aria-checked={enabled[kind]} aria-label={`${item.name}圖層`} onClick={() => toggle(kind)}>
              <span className="layer-symbol"><Icon size={21}/></span><span className="layer-copy"><strong>{item.name}</strong><span>{item.caption}</span></span>
              <span className="layer-count">{state.loading && !state.data ? <LoaderCircle size={16} className="spin"/> : !enabled[kind] ? '—' : state.data ? state.data.count.toLocaleString() : '!'}</span><span className="switch"/>
            </button>
            {state.error && <div className="layer-error" role="alert">{state.data && '更新失敗，現顯示上次成功載入的名冊。'}{state.error} <button className="text-button" onClick={() => fetchLayer(kind)}>重試</button></div>}
            {state.data?.count === 0 && <div className="layer-error">官方名冊暫無位置資料。</div>}
          </div>;
        })}</div>
        <p className="layer-note">數字代表官方公布的位置數目，並非正在運作的相機數量。偵速機箱名冊不包括政府隧道及管制區。</p>
        <div className="divider"/>
        <div ref={details} className="detail" tabIndex={-1}><div className="selection-label"><h3>相機詳情</h3>{selected && <button className="close-button" aria-label="關閉相機詳情" onClick={() => setSelected(null)}><X size={16}/></button>}</div>
          {selected ? <>
            <div className="detail-kind"><span className="color-dot" style={{ background: layers[selected.kind].color }}/>{layers[selected.kind].name}<span>／ {selected.sourceId}</span></div>
            <h4>{selected.name}</h4>
            {selected.kind === 'snapshot' && <SnapshotImage camera={selected} key={selected.id}/>}
            <dl>{selected.district && <><dt>所屬地區</dt><dd>{selected.region} · {selected.district}</dd></>}<dt>位置座標</dt><dd>{selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}</dd>{selected.sourceUpdated && <><dt>記錄更新</dt><dd>{selected.sourceUpdated.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1年$2月$3日')}</dd></>}{selected.remarks && <><dt>官方備註</dt><dd>{selected.remarks}</dd></>}</dl>
            {selected.kind !== 'snapshot' && <p className="detail-note">此圖層提供{selected.kind === 'speed' ? '偵速攝影機機箱' : '衝紅燈攝影機系統路口'}位置。官方並無提供此相機的即時運作狀態或快拍影像。</p>}
            <a className="detail-source" href={layers[selected.kind].source} target="_blank" rel="noreferrer">運輸署 · 官方資料來源 <ArrowUpRight size={13}/></a>
          </> : <div className="empty-detail"><div className="empty-icon"><MapPin size={26}/></div><h4>每段路況，一目了然</h4><p>點選地圖上的相機標記<br/>查看位置詳情或最新交通快拍</p></div>}
        </div>
      </div><footer className="sidebar-footer"><div className="connection" aria-live="polite"><span className={`connection-dot ${errors ? 'warning' : ''}`}/>{loading ? '正在讀取官方資料…' : errors ? '部分資料更新失敗' : latest ? `名冊讀取 ${hkTime(latest)}` : '未有可用資料'}</div><button className="icon-button" title="重新讀取所有官方名冊" aria-label="重新讀取所有官方名冊" disabled={loading} onClick={() => kinds.forEach(k => fetchLayer(k))}><RefreshCw size={14} className={loading ? 'spin' : ''}/></button></footer></aside>
      <TrafficMap cameras={cameras} selected={selected} onSelect={choose} loading={loading} allDisabled={kinds.every(k => !enabled[k])} hasErrors={errors}/>
    </div>
    <dialog ref={dialog} className="sources-dialog" aria-labelledby="sources-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}><div className="dialog-head"><h2 id="sources-title">資料來源與更新</h2><button className="close-button" aria-label="關閉資料來源" onClick={() => dialog.current?.close()}><X size={18}/></button></div><div className="dialog-body">
      {kinds.map(kind => <section className="source-entry" key={kind}><h3><span className="color-dot" style={{ background: layers[kind].color }}/>{layers[kind].name}</h3><p>{kind === 'snapshot' ? '運輸署交通快拍完整位置名冊（XML）及官方 JPEG 影像。已選快拍每兩分鐘重新讀取，時間取自影像回應的 Last-Modified。' : `運輸署於空間數據共享平台（CSDI）公布的${kind === 'speed' ? '偵速機箱位置（不包括政府隧道及管制區）' : '裝設衝紅燈攝影機系統的路口'}。先查詢全部記錄編號及總數，再分批取得每個位置，並核對完整性。位置名冊按官方資料更新。`}</p><a href={layers[kind].source} target="_blank" rel="noreferrer">資料一線通 ↗</a><a href={kind === 'snapshot' ? snapshotInventory : featureService(kind) + '?f=pjson'} target="_blank" rel="noreferrer">{kind === 'snapshot' ? '完整位置 XML' : 'CSDI 官方 API'} ↗</a>{states[kind].data && <div className="source-check">已核對 {states[kind].data!.count.toLocaleString()} / {states[kind].data!.expectedCount.toLocaleString()} 筆 · {hkTime(states[kind].data!.fetchedAt, true)} 讀取{states[kind].error ? '（更新失敗，保留上次名冊）' : ''}</div>}</section>)}
      <p className="dialog-footnote">所有位置及交通影像均取自香港政府，沒有模擬交通資料。名冊每五分鐘重新讀取。快拍為定時更新的靜態影像，並非直播；官方可能回傳「No Service」影像。本網站不代表香港特別行政區政府。</p>
      <p className="dialog-footnote">底圖：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap 貢獻者</a>（非政府底圖）。<a href="https://data.gov.hk/tc/terms-and-conditions" target="_blank" rel="noreferrer">政府開放數據使用條款</a>。</p>
    </div></dialog>
  </main>;
}
