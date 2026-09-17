'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Plus, Minus, LoaderCircle, MousePointer2 } from 'lucide-react';
import type * as Leaflet from 'leaflet';
import { messages } from '@/lib/i18n';
import { Camera, Language, layerText, layers } from '@/lib/traffic';

const symbols = {
  redlight: '<rect x="8" y="2" width="8" height="20" rx="3"/><path d="M5 5h3m8 0h3M5 12h3m8 0h3M5 19h3m8 0h3"/><circle cx="12" cy="7" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="17" r="1"/>',
  speed: '<path d="M4 18a9 9 0 1 1 16 0M12 13l5-5M6 9l1 1M12 5v2M4 15h2m12 0h2"/><circle cx="12" cy="14" r="2"/>',
  snapshot: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="m17 10 4-3v10l-4-3"/>',
  flow: '<path d="M12 3l6 10h-3.5v8h-5v-8H6l6-10z"/>',
  incident: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5m0 2.5v.5"/>',
  parking: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 17V7.5h3.4a3.1 3.1 0 0 1 0 6.2H10"/>',
  rainfall: '<path d="M12 3.5s5.8 6.4 5.8 10.6a5.8 5.8 0 1 1-11.6 0C6.2 9.9 12 3.5 12 3.5z"/>',
};
type Props = { cameras: Camera[]; selected: Camera | null; onSelect: (camera: Camera) => void; loading: boolean; allDisabled: boolean; hasErrors: boolean; language: Language; inactive?: boolean };
export default function TrafficMap({ cameras, selected, onSelect, loading, allDisabled, hasErrors, language, inactive = false }: Props) {
  const copy = messages[language];
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const cluster = useRef<Leaflet.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const previousSelection = useRef<string | null>(null);
  const selectRef = useRef(onSelect);
  const camerasRef = useRef(cameras);
  const copyRef = useRef(copy);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [inView, setInView] = useState(0);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { camerasRef.current = cameras; }, [cameras]);
  useEffect(() => { copyRef.current = copy; }, [copy]);
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
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors', maxZoom: 19,
      }).on('tileerror', () => setMapError(true)).addTo(m);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
      cluster.current = L.markerClusterGroup({ maxClusterRadius: 42, showCoverageOnHover: false, spiderfyOnMaxZoom: true, spiderfyDistanceMultiplier: 1.8, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        iconCreateFunction(group) {
          const children = group.getAllChildMarkers();
          const types = new Set(children.map(c => (c.options as Leaflet.MarkerOptions & { cameraKind: string }).cameraKind));
          const kind = [...types][0] as keyof typeof layers;
          return L.divIcon({ className: 'camera-cluster', html: `<div class="cluster-inner ${types.size > 1 ? 'mixed' : ''}" style="--cluster-color:${layers[kind].color}" aria-label="${copyRef.current.clusterLabel(children.length)}">${children.length}</div>`, iconSize: [40, 40] });
        },
      }).addTo(m);
      const countVisible = () => setInView(camerasRef.current.filter(c => m.getBounds().contains([c.lat, c.lng])).length);
      m.on('moveend', countVisible);
      observer = new ResizeObserver(() => { m.invalidateSize(); countVisible(); });
      observer.observe(element.current);
      setReady(true);
    })().catch(() => setMapError(true));
    return () => { disposed = true; observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const L = library.current, m = map.current, group = cluster.current;
    if (!ready || !L || !m || !group) return;
    group.clearLayers();
    markers.current.clear();
    group.addLayers(cameras.map(camera => {
      const name = language === 'en' ? camera.nameEn || camera.name : camera.name;
      const icon = L.divIcon({ className: 'camera-marker', html: `<div class="marker-inner" style="--marker-color:${camera.color ?? layers[camera.kind].color}"><svg viewBox="0 0 24 24"${camera.rotation ? ` style="transform:rotate(${camera.rotation}deg)"` : ''}>${symbols[camera.kind]}</svg></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const marker = L.marker([camera.lat, camera.lng], { icon, title: `${layerText(camera.kind, language).name}: ${name}`, alt: name, keyboard: true, cameraKind: camera.kind } as Leaflet.MarkerOptions);
      const label = document.createElement('span'); label.textContent = name;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -12] });
      marker.on('click', () => selectRef.current(camera));
      markers.current.set(camera.id, marker);
      return marker;
    }));
    setInView(cameras.filter(c => m.getBounds().contains([c.lat, c.lng])).length);
  }, [cameras, ready, language]);
  useEffect(() => {
    if (previousSelection.current) markers.current.get(previousSelection.current)?.getElement()?.querySelector('.marker-inner')?.classList.remove('selected');
    if (selected) markers.current.get(selected.id)?.getElement()?.querySelector('.marker-inner')?.classList.add('selected');
    previousSelection.current = selected?.id ?? null;
  }, [selected, cameras]);
  function fit() {
    if (cameras.length && library.current) map.current?.fitBounds(library.current.latLngBounds(cameras.map(c => [c.lat, c.lng])), { padding: [42, 64], maxZoom: 13 });
    else map.current?.setView([22.355, 114.13], 11);
  }
  const numberLocale = language === 'en' ? 'en-HK' : 'zh-HK';
  return <section className="map-area" aria-label={copy.mapLabel} aria-hidden={inactive || undefined} inert={inactive || undefined}>
    <div ref={element} className="map-canvas" role="group" aria-label={copy.mapKeyboardHelp} />
    <div className="map-heading"><strong>{copy.mapTitle}</strong><span>{copy.inView(inView.toLocaleString(numberLocale))}</span></div>
    <div className="map-tools"><div className="zoom-buttons"><button aria-label={copy.zoomIn} title={copy.zoomIn} onClick={() => map.current?.zoomIn()}><Plus size={19}/></button><button aria-label={copy.zoomOut} title={copy.zoomOut} onClick={() => map.current?.zoomOut()}><Minus size={19}/></button></div><button aria-label={copy.showAll} title={copy.returnToHongKong} onClick={fit}><LocateFixed size={20}/></button></div>
    {mapError && <div className="map-error" role="alert">{copy.mapLoadFailed}</div>}
    {!ready && !mapError && <div className="map-loading"><LoaderCircle className="spin" size={20}/> {copy.mapLoading}</div>}
    {ready && !loading && cameras.length === 0 && <div className="map-empty"><strong>{allDisabled ? copy.allLayersOff : hasErrors ? copy.cameraLoadFailed : copy.noCameraLocations}</strong>{allDisabled ? copy.turnOnLayer : copy.checkLayers}</div>}
    <div className="map-hint"><MousePointer2 size={14}/><span>{copy.mapHint}</span></div>
  </section>;
}
