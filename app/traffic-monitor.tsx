'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Clock3, Gauge, Info, Layers, LoaderCircle, MapPin, RefreshCw, Route, ShieldCheck, SlidersHorizontal, TrafficCone, Video, X } from 'lucide-react';
import { formatRecordDate, messages } from '@/lib/i18n';
import { Camera, CameraData, Language, LayerKind, featureService, hkTime, kinds, layerText, layers, snapshotInventory, snapshotInventoryEn } from '@/lib/traffic';
import TrafficMap from './traffic-map';

type LayerState = { data?: CameraData; loading: boolean; error: boolean };
type Snapshot = { imageUrl: string; updatedAt: string | null; fetchedAt: string };

const icons = { redlight: TrafficCone, speed: Gauge, snapshot: Video };
const languageStorageKey = 'hk-traffic-language-v1';
const compactLayoutQuery = '(max-width: 700px), (max-height: 520px) and (orientation: landscape)';
const languageListeners = new Set<() => void>();
let fallbackLanguage: Language | undefined;
let storageWriteFailed = false;

function getLanguageSnapshot(): Language {
  if (storageWriteFailed && fallbackLanguage) return fallbackLanguage;
  try {
    const stored = window.localStorage.getItem(languageStorageKey);
    if (stored === 'en' || stored === 'zh') {
      fallbackLanguage = stored;
      return stored;
    }
  } catch {
    // Storage can be unavailable in locked-down browser contexts; use the browser language.
  }
  if (fallbackLanguage) return fallbackLanguage;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function getServerLanguageSnapshot(): Language {
  return 'zh';
}

function subscribeLanguage(listener: () => void) {
  languageListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === languageStorageKey || event.key === null) {
      storageWriteFailed = false;
      fallbackLanguage = event.newValue === 'en' || event.newValue === 'zh' ? event.newValue : undefined;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    languageListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function setStoredLanguage(language: Language) {
  fallbackLanguage = language;
  try {
    window.localStorage.setItem(languageStorageKey, language);
    storageWriteFailed = false;
  } catch {
    storageWriteFailed = true;
    // The in-memory subscription still updates the current tab when storage is unavailable.
  }
  languageListeners.forEach(listener => listener());
}

function SnapshotImage({ camera, language }: { camera: Camera; language: Language }) {
  const copy = messages[language];
  const [shot, setShot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/snapshot/${camera.sourceId}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]), cache: 'no-store' });
        if (!response.ok) throw new Error('Snapshot request failed');
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        if (abort.signal.aborted) {
          URL.revokeObjectURL(imageUrl);
          return;
        }
        const modified = response.headers.get('Last-Modified');
        setShot({
          imageUrl,
          updatedAt: modified && !Number.isNaN(Date.parse(modified)) ? new Date(modified).toISOString() : null,
          fetchedAt: response.headers.get('X-Snapshot-Fetched-At') ?? new Date().toISOString(),
        });
      } catch {
        if (!abort.signal.aborted) setError(true);
      } finally {
        busy = false;
        if (!abort.signal.aborted) setLoading(false);
      }
    }
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 120000);
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      abort.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [camera.sourceId, tick]);

  useEffect(() => {
    const imageUrl = shot?.imageUrl;
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [shot?.imageUrl]);

  const stale = Boolean(shot?.updatedAt && Date.parse(shot.fetchedAt) - Date.parse(shot.updatedAt) > 10 * 60000);
  const cameraName = language === 'en' ? camera.nameEn || camera.name : camera.name;

  return <>
    <div className="snapshot-frame">
      {shot && <Image src={shot.imageUrl} alt={copy.snapshotAlt(cameraName)} fill sizes="(max-width: 700px) 100vw, 300px" unoptimized onError={() => setError(true)}/>}
      {loading && !shot && <div className="image-status" aria-live="polite"><LoaderCircle size={18} className="spin"/>{copy.loadingSnapshot}</div>}
      {error && <div className="image-status" role="alert"><div>{shot ? copy.snapshotDisplayFailed : copy.snapshotTimeout}<br/><button className="text-button" onClick={() => setTick(value => value + 1)}>{copy.reloadSnapshot}</button></div></div>}
    </div>
    <div className="snapshot-meta">
      <span className={`image-update ${stale ? 'stale' : ''}`}><Clock3 size={12}/>{shot?.updatedAt ? copy.snapshotUpdated(hkTime(shot.updatedAt, true, language)) : shot ? copy.snapshotNoUpdateTime : copy.snapshotWaiting}</span>
      <button className="refresh-image" title={copy.refreshSnapshot} aria-label={copy.refreshSnapshot} disabled={loading} onClick={() => setTick(value => value + 1)}><RefreshCw size={14} className={loading ? 'spin' : ''}/></button>
    </div>
    {stale && <p className="subtle warning-text">{copy.snapshotStale}</p>}
    <p className="subtle snapshot-note">{copy.snapshotNote}</p>
  </>;
}

export default function TrafficMonitor() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, getServerLanguageSnapshot);
  const copy = messages[language];
  const numberLocale = language === 'en' ? 'en-HK' : 'zh-HK';
  const [enabled, setEnabled] = useState<Record<LayerKind, boolean>>({ redlight: true, speed: true, snapshot: true });
  const [states, setStates] = useState<Record<LayerKind, LayerState>>({
    redlight: { loading: true, error: false },
    speed: { loading: true, error: false },
    snapshot: { loading: true, error: false },
  });
  const [selected, setSelected] = useState<Camera | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const details = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const mobilePanelButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const inflight = useRef(new Set<LayerKind>());

  const closeMobilePanel = useCallback(() => {
    setMobilePanelOpen(false);
    setTimeout(() => mobilePanelButton.current?.focus(), 0);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en-HK' : 'zh-HK';
  }, [language]);

  useEffect(() => {
    const media = window.matchMedia(compactLayoutQuery);
    if (!mobilePanelOpen || !media.matches) return;
    const panelElement = panel.current;
    if (!panelElement) return;
    const focusable = () => Array.from(panelElement.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
    const focusFirst = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobilePanel();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !panelElement.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelElement.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!panelElement.contains(event.target as Node)) focusable()[0]?.focus();
    };
    const onLayoutChange = (event: MediaQueryListEvent) => {
      if (!event.matches) closeMobilePanel();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    media.addEventListener('change', onLayoutChange);
    return () => {
      cancelAnimationFrame(focusFirst);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      media.removeEventListener('change', onLayoutChange);
    };
  }, [closeMobilePanel, mobilePanelOpen]);

  const fetchLayer = useCallback(async (kind: LayerKind) => {
    if (inflight.current.has(kind)) return;
    inflight.current.add(kind);
    setStates(state => ({ ...state, [kind]: { ...state[kind], loading: true, error: false } }));
    try {
      const response = await fetch(`/api/cameras/${kind}`, { signal: AbortSignal.timeout(90000), cache: 'no-store' });
      if (!response.ok) throw new Error('Camera request failed');
      const data = await response.json() as CameraData;
      setStates(state => ({ ...state, [kind]: { data, loading: false, error: false } }));
    } catch {
      setStates(state => ({ ...state, [kind]: { ...state[kind], loading: false, error: true } }));
    } finally {
      inflight.current.delete(kind);
    }
  }, []);

  useEffect(() => {
    kinds.forEach(kind => fetchLayer(kind));
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') kinds.forEach(kind => fetchLayer(kind));
    }, 300000);
    return () => clearInterval(interval);
  }, [fetchLayer]);

  const cameras = useMemo(() => kinds.flatMap(kind => enabled[kind] ? states[kind].data?.cameras ?? [] : []), [states, enabled]);
  const total = kinds.reduce((count, kind) => count + (states[kind].data?.count ?? 0), 0);
  const loading = kinds.some(kind => states[kind].loading);
  const errors = kinds.some(kind => states[kind].error);
  const complete = kinds.every(kind => states[kind].data?.complete) && !errors;
  const times = kinds.flatMap(kind => states[kind].data ? [states[kind].data!.fetchedAt] : []).sort();
  const latest = times.at(-1);

  function toggle(kind: LayerKind) {
    setEnabled(current => ({ ...current, [kind]: !current[kind] }));
    if (selected?.kind === kind && enabled[kind]) setSelected(null);
  }

  const choose = useCallback((camera: Camera) => {
    setSelected(camera);
    if (window.matchMedia(compactLayoutQuery).matches) setMobilePanelOpen(true);
    setTimeout(() => details.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }), 80);
  }, []);

  const selectedName = selected && (language === 'en' ? selected.nameEn || selected.name : selected.name);
  const selectedDistrict = selected && (language === 'en' ? selected.districtEn || selected.district : selected.district);
  const selectedRegion = selected && (language === 'en' ? selected.regionEn || selected.region : selected.region);

  return <main className="app-shell">
    <header className="topbar" inert={mobilePanelOpen || undefined}>
      <div className="brand"><div className="brand-icon"><Route size={25}/></div><div><h1>{copy.brandTitle}</h1><p>{copy.brandSubtitle}</p></div></div>
      <div className="header-meta">
        <span className="official-tag"><ShieldCheck size={15}/>{copy.officialData}</span>
        <div className="language-toggle" role="group" aria-label={copy.languageControl}>
          <button type="button" aria-pressed={language === 'en'} title={copy.english} onClick={() => setStoredLanguage('en')}>ENG</button>
          <button type="button" aria-pressed={language === 'zh'} title={copy.chinese} onClick={() => setStoredLanguage('zh')}>CHN</button>
        </div>
        <button className="source-button" aria-label={copy.sources} onClick={() => dialog.current?.showModal()}><Info size={17}/><span>{copy.sources}</span></button>
      </div>
    </header>
    <div className="workspace">
      <TrafficMap cameras={cameras} selected={selected} onSelect={choose} loading={loading} allDisabled={kinds.every(kind => !enabled[kind])} hasErrors={errors} language={language} inactive={mobilePanelOpen}/>
      <button className={`mobile-scrim ${mobilePanelOpen ? 'visible' : ''}`} aria-label={copy.closeControls} aria-hidden="true" tabIndex={-1} onClick={closeMobilePanel}/>
      <aside ref={panel} className={`sidebar ${mobilePanelOpen ? 'mobile-open' : ''}`} aria-label={copy.sidebarLabel} role={mobilePanelOpen ? 'dialog' : undefined} aria-modal={mobilePanelOpen || undefined}>
        <div className="mobile-panel-head"><strong>{copy.panelTitle}</strong><button className="close-button" aria-label={copy.closeControls} onClick={closeMobilePanel}><X size={19}/></button></div>
        <div className="sidebar-scroll">
          <p className="eyebrow">{copy.overviewEyebrow}</p>
          <div className="overview-heading"><h2>{copy.overviewTitle}</h2><Layers size={19}/></div>
          <div className="summary" aria-live="polite"><strong>{total ? total.toLocaleString(numberLocale) : loading ? '—' : '0'}</strong><span>{copy.publishedLocations}</span>{complete && <small>{copy.completeInventory}</small>}</div>
          <div className="section-label"><h3>{copy.mapLayers}</h3><span>{copy.showingLocations(cameras.length.toLocaleString(numberLocale))}</span></div>
          <div className="layer-list">{kinds.map(kind => {
            const text = layerText(kind, language);
            const state = states[kind];
            const Icon = icons[kind];
            return <div key={kind} className={`layer-card ${kind} ${enabled[kind] ? 'active' : ''}`}>
              <button className="layer-toggle" role="switch" aria-checked={enabled[kind]} aria-label={copy.layerSwitch(text.name)} onClick={() => toggle(kind)}>
                <span className="layer-symbol"><Icon size={21}/></span><span className="layer-copy"><strong>{text.name}</strong><span>{text.caption}</span></span>
                <span className="layer-count">{state.loading && !state.data ? <LoaderCircle size={16} className="spin"/> : !enabled[kind] ? '—' : state.data ? state.data.count.toLocaleString(numberLocale) : '!'}</span><span className="switch"/>
              </button>
              {state.error && <div className="layer-error" role="alert">{state.data ? copy.layerUpdateFailed : copy.dataLoadFailed} <button className="text-button" onClick={() => fetchLayer(kind)}>{copy.retry}</button></div>}
              {state.data?.count === 0 && <div className="layer-error">{copy.noOfficialLocations}</div>}
            </div>;
          })}</div>
          <p className="layer-note">{copy.layerNote}</p>
          <div className="divider"/>
          <div ref={details} className="detail" tabIndex={-1}>
            <div className="selection-label"><h3>{copy.cameraDetails}</h3>{selected && <button className="close-button" aria-label={copy.closeCameraDetails} onClick={() => setSelected(null)}><X size={16}/></button>}</div>
            {selected ? <>
              <div className="detail-kind"><span className="color-dot" style={{ background: layers[selected.kind].color }}/>{layerText(selected.kind, language).name}<span>／ {selected.sourceId}</span></div>
              <h4>{selectedName}</h4>
              {selected.kind === 'snapshot' && <SnapshotImage camera={selected} language={language} key={selected.id}/>}
              <dl>
                {selectedDistrict && <><dt>{copy.district}</dt><dd>{selectedRegion ? `${selectedRegion} · ` : ''}{selectedDistrict}</dd></>}
                <dt>{copy.coordinates}</dt><dd>{selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}</dd>
                {selected.sourceUpdated && <><dt>{copy.recordUpdated}</dt><dd>{formatRecordDate(selected.sourceUpdated, language)}</dd></>}
                {selected.remarks && <><dt>{copy.officialRemarks}</dt><dd>{selected.remarks}</dd></>}
              </dl>
              {selected.kind !== 'snapshot' && <p className="detail-note">{copy.layerDetail[selected.kind]}</p>}
              <a className="detail-source" href={layers[selected.kind].source} target="_blank" rel="noreferrer">{copy.officialSource} <ArrowUpRight size={13}/></a>
            </> : <div className="empty-detail"><div className="empty-icon"><MapPin size={26}/></div><h4>{copy.emptyDetailTitle}</h4><p>{copy.emptyDetailBody}</p></div>}
          </div>
        </div>
        <footer className="sidebar-footer"><div className="connection" aria-live="polite"><span className={`connection-dot ${errors ? 'warning' : ''}`}/>{loading ? copy.loadingOfficialData : errors ? copy.partialUpdateFailure : latest ? copy.inventoryFetched(hkTime(latest, false, language)) : copy.noData}</div><button className="icon-button" title={copy.refreshAll} aria-label={copy.refreshAll} disabled={loading} onClick={() => kinds.forEach(kind => fetchLayer(kind))}><RefreshCw size={15} className={loading ? 'spin' : ''}/></button></footer>
      </aside>
      <nav className="mobile-dock" aria-label={copy.mapLayers} aria-hidden={mobilePanelOpen || undefined} inert={mobilePanelOpen || undefined}>
        {kinds.map(kind => {
          const Icon = icons[kind];
          const text = layerText(kind, language);
          return <button key={kind} className={`mobile-layer-button ${kind} ${enabled[kind] ? 'active' : ''}`} aria-label={copy.layerSwitch(text.name)} aria-pressed={enabled[kind]} onClick={() => toggle(kind)}><Icon size={19}/><span>{text.short}</span></button>;
        })}
        <button ref={mobilePanelButton} className="mobile-panel-button" aria-label={copy.openControls} aria-expanded={mobilePanelOpen} onClick={() => setMobilePanelOpen(true)}><SlidersHorizontal size={19}/><span>{selected ? copy.cameraDetails : copy.panelTitle}</span></button>
      </nav>
    </div>
    <dialog ref={dialog} className="sources-dialog" aria-labelledby="sources-title" onClick={event => {
      if (event.target === event.currentTarget) dialog.current?.close();
    }}>
      <div className="dialog-head"><h2 id="sources-title">{copy.sourceDialogTitle}</h2><button className="close-button" aria-label={copy.closeSources} onClick={() => dialog.current?.close()}><X size={18}/></button></div>
      <div className="dialog-body">
        {kinds.map(kind => {
          const text = layerText(kind, language);
          const data = states[kind].data;
          return <section className="source-entry" key={kind}>
            <h3><span className="color-dot" style={{ background: layers[kind].color }}/>{text.name}</h3>
            <p>{copy.sourceDescriptions[kind]}</p>
            <a href={layers[kind].source} target="_blank" rel="noreferrer">{copy.dataGovLink} ↗</a>
            <a href={kind === 'snapshot' ? language === 'en' ? snapshotInventoryEn : snapshotInventory : featureService(kind) + '?f=pjson'} target="_blank" rel="noreferrer">{kind === 'snapshot' ? copy.locationXml : copy.officialApi} ↗</a>
            {data && <div className="source-check">{copy.sourceChecked(data.count.toLocaleString(numberLocale), data.expectedCount.toLocaleString(numberLocale), hkTime(data.fetchedAt, true, language), states[kind].error)}</div>}
          </section>;
        })}
        <p className="dialog-footnote">{copy.sourceFootnote}</p>
        <p className="dialog-footnote">{copy.basemap}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{copy.osmContributors}</a>{copy.nonGovernmentBasemap}<a href="https://data.gov.hk/tc/terms-and-conditions" target="_blank" rel="noreferrer">{copy.governmentTerms}</a>.</p>
      </div>
    </dialog>
  </main>;
}
