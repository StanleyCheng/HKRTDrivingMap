'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Plus, Minus, LoaderCircle, MousePointer2 } from 'lucide-react';
import type * as Leaflet from 'leaflet';
import { Camera, layers } from '@/lib/traffic';

const symbols = {
  redlight: '<rect x="8" y="2" width="8" height="20" rx="3"/><path d="M5 5h3m8 0h3M5 12h3m8 0h3M5 19h3m8 0h3"/><circle cx="12" cy="7" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="17" r="1"/>',
  speed: '<path d="M4 18a9 9 0 1 1 16 0M12 13l5-5M6 9l1 1M12 5v2M4 15h2m12 0h2"/><circle cx="12" cy="14" r="2"/>',
  snapshot: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="m17 10 4-3v10l-4-3"/>',
};
type Props = { cameras: Camera[]; selected: Camera | null; onSelect: (camera: Camera) => void; loading: boolean; allDisabled: boolean; hasErrors: boolean };
export default function TrafficMap({ cameras, selected, onSelect, loading, allDisabled, hasErrors }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const cluster = useRef<Leaflet.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const previousSelection = useRef<string | null>(null);
  const selectRef = useRef(onSelect);
  const camerasRef = useRef(cameras);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [inView, setInView] = useState(0);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { camerasRef.current = cameras; }, [cameras]);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      (window as unknown as { L: typeof Leaflet }).L = L;
      await import('leaflet.markercluster');
      if (disposed || !element.current) return;
      library.current = L;
      const m = L.map(element.current, { zoomControl: false, minZoom: 10, maxZoom: 19, attributionControl: true }).setView([22.355, 114.13], 11);
      map.current = m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> 貢獻者', maxZoom: 19,
      }).on('tileerror', () => setMapError('底圖暫時未能完整載入。相機位置資料不受影響，請檢查網絡或重新載入。')).addTo(m);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
      cluster.current = L.markerClusterGroup({ maxClusterRadius: 42, showCoverageOnHover: false, spiderfyOnMaxZoom: true, spiderfyDistanceMultiplier: 1.8, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        iconCreateFunction(group) {
          const children = group.getAllChildMarkers();
          const types = new Set(children.map(c => (c.options as Leaflet.MarkerOptions & { cameraKind: string }).cameraKind));
          const kind = [...types][0] as keyof typeof layers;
          return L.divIcon({ className: 'camera-cluster', html: `<div class="cluster-inner ${types.size > 1 ? 'mixed' : ''}" style="--cluster-color:${layers[kind].color}" aria-label="${children.length} 個相機位置，按下展開">${children.length}</div>`, iconSize: [40, 40] });
        },
      }).addTo(m);
      const countVisible = () => setInView(camerasRef.current.filter(c => m.getBounds().contains([c.lat, c.lng])).length);
      m.on('moveend', countVisible);
      observer = new ResizeObserver(() => { m.invalidateSize(); countVisible(); });
      observer.observe(element.current);
      setReady(true);
    })().catch(() => setMapError('互動地圖未能載入，請重新整理網頁。'));
    return () => { disposed = true; observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const L = library.current, m = map.current, group = cluster.current;
    if (!ready || !L || !m || !group) return;
    group.clearLayers();
    markers.current.clear();
    group.addLayers(cameras.map(camera => {
      const icon = L.divIcon({ className: 'camera-marker', html: `<div class="marker-inner" style="--marker-color:${layers[camera.kind].color}"><svg viewBox="0 0 24 24">${symbols[camera.kind]}</svg></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const marker = L.marker([camera.lat, camera.lng], { icon, title: `${layers[camera.kind].name}：${camera.name}`, alt: camera.name, keyboard: true, cameraKind: camera.kind } as Leaflet.MarkerOptions);
      const label = document.createElement('span'); label.textContent = camera.name;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -12] });
      marker.on('click', () => selectRef.current(camera));
      markers.current.set(camera.id, marker);
      return marker;
    }));
    setInView(cameras.filter(c => m.getBounds().contains([c.lat, c.lng])).length);
  }, [cameras, ready]);
  useEffect(() => {
    if (previousSelection.current) markers.current.get(previousSelection.current)?.getElement()?.querySelector('.marker-inner')?.classList.remove('selected');
    if (selected) markers.current.get(selected.id)?.getElement()?.querySelector('.marker-inner')?.classList.add('selected');
    previousSelection.current = selected?.id ?? null;
  }, [selected, cameras]);
  function fit() {
    if (cameras.length && library.current) map.current?.fitBounds(library.current.latLngBounds(cameras.map(c => [c.lat, c.lng])), { padding: [42, 64], maxZoom: 13 });
    else map.current?.setView([22.355, 114.13], 11);
  }
  return <section className="map-area" aria-label="香港相機位置互動地圖">
    <div ref={element} className="map-canvas" role="group" aria-label="使用方向鍵移動地圖，點選數字群組放大" />
    <div className="map-heading"><strong>全港交通地圖</strong><span>範圍內 {inView.toLocaleString()} 個位置</span></div>
    <div className="map-tools"><div className="zoom-buttons"><button aria-label="放大地圖" title="放大" onClick={() => map.current?.zoomIn()}><Plus size={18}/></button><button aria-label="縮小地圖" title="縮小" onClick={() => map.current?.zoomOut()}><Minus size={18}/></button></div><button aria-label="顯示全部相機位置" title="返回全港" onClick={fit}><LocateFixed size={19}/></button></div>
    {mapError && <div className="map-error" role="alert">{mapError}</div>}
    {!ready && !mapError && <div className="map-loading"><LoaderCircle className="spin" size={20}/> 正在載入地圖</div>}
    {ready && !loading && cameras.length === 0 && <div className="map-empty"><strong>{allDisabled ? '所有圖層已關閉' : hasErrors ? '暫時未能載入相機位置' : '暫無相機位置資料'}</strong>{allDisabled ? '開啟相機圖層，即可在地圖查看位置。' : '請查看圖層狀態，並按重新整理再試。'}</div>}
    <div className="map-hint"><MousePointer2 size={14}/><span>點選相機查看詳情 · 點選數字展開相機群組</span></div>
  </section>;
}
