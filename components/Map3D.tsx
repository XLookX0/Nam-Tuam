'use client';

import { useEffect, useRef, useState } from 'react';
import type * as ml from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Station, ColorBy, markerColor, pillarHeight, circlePolygon, fmtTime, isStale, PILLAR_FULL_M } from '@/lib/station';
import { funKind, funIconSvg } from '@/lib/funIcons';
import type { MapProps } from './Map';

// Next.js/Turbopack mangles MapLibre's web worker ("Worker failed to load"), so the library itself is loaded at
// runtime from a CDN (its official build creates the worker internally). The npm package is only used for types and CSS.
type MapLibre = typeof import('maplibre-gl');
let libPromise: Promise<MapLibre> | null = null;
function loadMapLibre(): Promise<MapLibre> {
  const w = window as unknown as { maplibregl?: MapLibre };
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  libPromise ??= new Promise<MapLibre>((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.js';
    sc.async = true;
    sc.onload = () => (w.maplibregl ? resolve(w.maplibregl) : reject(new Error('maplibre-gl missing after load')));
    sc.onerror = () => {
      libPromise = null;
      reject(new Error('maplibre-gl failed to download'));
    };
    document.head.appendChild(sc);
  });
  return libPromise;
}

const CENTER: [number, number] = [100.0022, 13.4093]; // lng, lat
const BOUNDS: [[number, number], [number, number]] = [[99.6, 13.0], [100.4, 13.8]];
const SRC = 'flood-stations';
const STYLES = ['dark', 'liberty']; // OpenFreeMap style names, tried in order

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Pillars shrink as you zoom in so they don't swallow the city. */
const HEIGHT_EXPR = [
  'interpolate', ['linear'], ['zoom'],
  10, ['get', 'h'],
  14, ['*', ['get', 'h'], 0.3],
] as unknown as ml.ExpressionSpecification;

/** OpenFreeMap's "dark" style is almost black on black. Recolour it to the dashboard's deep teal-navy so roads, water and labels read. */
function retheme(map: ml.Map, layers: ml.LayerSpecification[]) {
  for (const l of layers) {
    try {
      const id = l.id;
      if (l.type === 'background') {
        map.setPaintProperty(id, 'background-color', '#071a22');
      } else if (l.type === 'fill') {
        const c = id === 'building' ? '#173644'
          : id.includes('water') ? '#0f4257'
          : /park|wood|grass/.test(id) ? '#0d2a30'
          : id.includes('residential') ? '#0b222b'
          : null;
        if ((l.paint as Record<string, unknown> | undefined)?.['fill-pattern']) map.setPaintProperty(id, 'fill-pattern', undefined);
        if (c) map.setPaintProperty(id, 'fill-color', c);
        if (id === 'building') map.setPaintProperty(id, 'fill-outline-color', '#24505f');
      } else if (l.type === 'line') {
        if (id.startsWith('waterway')) map.setPaintProperty(id, 'line-color', '#1c6f8c');
        else if (/casing/.test(id)) map.setPaintProperty(id, 'line-color', '#0a1c23');
        else if (/highway|railway|bridge|tunnel|road|aeroway/.test(id)) map.setPaintProperty(id, 'line-color', '#35606f');
      } else if (l.type === 'symbol' && (l.layout as Record<string, unknown> | undefined)?.['text-field']) {
        map.setPaintProperty(id, 'text-color', '#b7cdd2');
        map.setPaintProperty(id, 'text-halo-color', '#071219');
        map.setPaintProperty(id, 'text-halo-width', 1.2);
      }
    } catch {
      /* a layer that doesn't accept that property: skip it */
    }
  }
}

const shortName = (n: string) => n.replace(/\s*\(.*\)/, '').replace(/^สถานี(วัดน้ำ)?/, '').trim() || n;

function labelHtml(st: Station) {
  const cm = Math.round((Number(st.bankHeight) - Number(st.waterLevel)) * 100);
  const rel = cm >= 0 ? `ต่ำกว่าตลิ่ง ${cm} ซม.` : `สูงกว่าตลิ่ง ${-cm} ซม.`;
  return `<div class="flood-label-card" style="--c:${markerColor(st, 'level')}"><div class="fl-name">${esc(shortName(st.name))}</div><div class="fl-meta"><b>${st.waterLevel} ม.</b> ${rel}</div></div>`;
}

/** Pixels from a station's base to the top of its water pillar on screen. */
function liftPx(map: ml.Map, st: Station) {
  const z = map.getZoom();
  const f = z <= 10 ? 1 : z >= 14 ? 0.3 : 1 - (z - 10) * 0.175;
  const sinP = Math.sin((map.getPitch() * Math.PI) / 180);
  const mpp = (156543.03392 * Math.cos((Number(st.lat) * Math.PI) / 180)) / Math.pow(2, z);
  return (pillarHeight(st) * f * sinP) / mpp;
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function loadStyle() {
  for (const name of STYLES) {
    try {
      const res = await fetch(`https://tiles.openfreemap.org/styles/${name}`);
      if (res.ok) return (await res.json()) as ml.StyleSpecification;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Two shapes per station: a translucent "bank" tube at full height and a solid water pillar inside it. */
function buildData(stations: Station[], colorBy: ColorBy): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const st of stations) {
    const lng = Number(st.lng), lat = Number(st.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const id = String(st.id);
    features.push({ type: 'Feature', properties: { id, kind: 'bank', h: PILLAR_FULL_M, color: '#9fb8bf' }, geometry: { type: 'Polygon', coordinates: circlePolygon(lng, lat, 380) } });
    features.push({ type: 'Feature', properties: { id, kind: 'water', h: pillarHeight(st), color: markerColor(st, colorBy) }, geometry: { type: 'Polygon', coordinates: circlePolygon(lng, lat, 250) } });
  }
  return { type: 'FeatureCollection', features };
}

function popupHtml(st: Station) {
  const pct = Number(st.capacityPercent) || 0;
  const color = markerColor(st, 'level');
  const trend = st.trend === 'rising' ? 'กำลังขึ้น' : st.trend === 'falling' ? 'กำลังลด' : 'ทรงตัว';
  return `<div style="min-width:200px">
    <div style="font-weight:600;font-size:14px;line-height:1.35">${esc(st.name)}</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;font-size:12px;color:#cbd5d8">
      <span>น้ำ <b style="color:#fff">${st.waterLevel} ม.</b> จากตลิ่ง ${st.bankHeight} ม.</span>
      <b style="color:${color}">${pct}%</b>
    </div>
    <div style="margin-top:6px;height:6px;border-radius:9999px;background:rgba(255,255,255,.12);overflow:hidden">
      <div style="height:100%;width:${Math.min(pct, 100)}%;background:${color};border-radius:9999px"></div>
    </div>
    <div style="margin-top:8px;font-size:12px;color:#cbd5d8;display:flex;justify-content:space-between">
      <span>${trend}</span><span>วัดเมื่อ ${fmtTime(st.updatedAt)} น.</span>
    </div>
  </div>`;
}

export default function Map3D(props: MapProps) {
  const { stations, selectedStation, focusKey, colorBy = 'level', userPos, camera, layers, fun } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ml.Map | null>(null);
  const popupRef = useRef<ml.Popup | null>(null);
  const userRef = useRef<ml.Marker | null>(null);
  const glRef = useRef<MapLibre | null>(null);
  const layerIds = useRef<{ canals: string[]; roads: string[]; buildings: string[] }>({ canals: [], roads: [], buildings: [] });
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    let map: ml.Map | undefined;

    (async () => {
      if (!webglOk()) return propsRef.current.onUnsupported?.();
      let gl: MapLibre;
      try {
        gl = await loadMapLibre();
      } catch (err) {
        console.warn('[Map3D]', err);
        return propsRef.current.onUnsupported?.();
      }
      glRef.current = gl;
      const style = await loadStyle();
      if (cancelled || !box.current) return;
      if (!style) return propsRef.current.onUnsupported?.();

      map = new gl.Map({
        container: box.current,
        style,
        center: CENTER,
        zoom: 11.8,
        pitch: 60,
        bearing: -20,
        maxPitch: 80,
        minZoom: 9,
        maxBounds: BOUNDS,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.on('error', (e) => {
        const msg = String(e?.error?.message ?? e);
        console.warn('[Map3D]', msg);
        // A dead worker means a permanently blank map: hand control back so the page falls back to 2D
        if (/worker/i.test(msg)) propsRef.current.onUnsupported?.();
      });
      map.once('style.load', () => {
        if (!map) return;
        const s = map.getStyle();
        retheme(map, s.layers);
        // 3D buildings: reuse the style's own if it has them, otherwise extrude the vector "building" layer
        const vec = Object.keys(s.sources).find((k) => s.sources[k].type === 'vector');
        if (vec && !s.layers.some((l) => l.type === 'fill-extrusion')) {
          map.addLayer({
            id: 'buildings-3d',
            type: 'fill-extrusion',
            source: vec,
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': '#1d3a45',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.85,
            },
          });
        }

        const all = map.getStyle().layers;
        layerIds.current = {
          canals: all.filter((x) => x.id.startsWith('waterway')).map((x) => x.id),
          roads: all.filter((x) => x.type === 'line' && /highway|road|bridge|tunnel|railway/.test(x.id)).map((x) => x.id),
          buildings: all.filter((x) => x.id === 'building' || x.type === 'fill-extrusion').map((x) => x.id),
        };

        map.addSource(SRC, { type: 'geojson', data: buildData(propsRef.current.stations, propsRef.current.colorBy ?? 'level') });
        // Order matters: the opaque pillars must be drawn BEFORE the translucent tubes around them,
        // otherwise the tube's depth hides the pillar inside it.
        map.addLayer({
          id: 'water-pillars',
          type: 'fill-extrusion',
          source: SRC,
          filter: ['==', ['get', 'kind'], 'water'],
          paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': HEIGHT_EXPR, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 },
        });
        map.addLayer({
          id: 'bank-tubes',
          type: 'fill-extrusion',
          source: SRC,
          filter: ['==', ['get', 'kind'], 'bank'],
          paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': HEIGHT_EXPR, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.22 },
        });

        for (const layer of ['water-pillars', 'bank-tubes']) {
          map.on('click', layer, (e) => {
            const id = e.features?.[0]?.properties?.id;
            const st = propsRef.current.stations.find((x) => String(x.id) === String(id));
            if (st) propsRef.current.onSelect?.(st);
          });
          map.on('mouseenter', layer, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, () => { if (map) map.getCanvas().style.cursor = ''; });
        }
        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      userRef.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep pillars in sync with data and colour mode
  useEffect(() => {
    const src = mapRef.current?.getSource(SRC) as ml.GeoJSONSource | undefined;
    if (ready && src) src.setData(buildData(stations, colorBy));
  }, [ready, stations, colorBy]);

  // Fly to the selected station and show its popup
  const selId = selectedStation?.id;
  useEffect(() => {
    popupRef.current?.remove();
    popupRef.current = null;
    const map = mapRef.current;
    const st = propsRef.current.selectedStation;
    if (!ready || !map || !st || !glRef.current) return;
    const lngLat: [number, number] = [Number(st.lng), Number(st.lat)];
    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 13.2), pitch: 62, duration: 1400, essential: true });
    popupRef.current = new glRef.current.Popup({ offset: 12, maxWidth: '280px', closeOnClick: false })
      .setLngLat(lngLat)
      .setHTML(popupHtml(st))
      .addTo(map);
  }, [ready, selId, focusKey]);

  // Layer toggles (canals / roads / buildings)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !layers) return;
    for (const k of ['canals', 'roads', 'buildings'] as const) {
      for (const id of layerIds.current[k]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[k] ? 'visible' : 'none');
      }
    }
  }, [ready, layers]);

  // Camera presets: city view, top-down, and a guided tour of the stations closest to their banks
  const camMode = camera?.mode;
  const camKey = camera?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !camKey || !camMode) return;
    if (camMode === 'city') {
      map.flyTo({ center: CENTER, zoom: 11.8, pitch: 60, bearing: -20, duration: 1600, essential: true });
      return;
    }
    if (camMode === 'top') {
      map.flyTo({ pitch: 0, bearing: 0, duration: 1200, essential: true });
      return;
    }
    // tour
    const stops = propsRef.current.stations
      .filter((s) => !isStale(s))
      .sort((a, b) => Number(b.capacityPercent) - Number(a.capacityPercent))
      .slice(0, 6);
    if (!stops.length) {
      propsRef.current.onCameraEnd?.();
      return;
    }
    let i = 0;
    const go = () => propsRef.current.onSelect?.(stops[i++ % stops.length]);
    go();
    const timer = setInterval(go, 6500);
    const canvas = map.getCanvas();
    const stop = () => propsRef.current.onCameraEnd?.();
    canvas.addEventListener('pointerdown', stop, { once: true });
    return () => {
      clearInterval(timer);
      canvas.removeEventListener('pointerdown', stop);
    };
  }, [ready, camKey, camMode]);

  // Floating name cards above the pillars of stations that need attention (plus the selected one)
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!ready || !map || !gl) return;
    const picks = stations
      .filter((s) => !isStale(s) && (s.status !== 'normal' || s.id === selId))
      .sort((a, b) => Number(b.capacityPercent) - Number(a.capacityPercent))
      .slice(0, 6);
    const items = picks.map((st) => {
      const el = document.createElement('div');
      el.className = 'flood-label';
      el.innerHTML = labelHtml(st);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        propsRef.current.onSelect?.(st);
      });
      const marker = new gl.Marker({ element: el, anchor: 'bottom' }).setLngLat([Number(st.lng), Number(st.lat)]).addTo(map);
      return { st, marker };
    });
    // Lift each card to the top of its pillar (and above the fun icon when it's on)
    const place = () => {
      for (const { st, marker } of items) marker.setOffset([0, -liftPx(map, st) - 8 - (fun ? 40 : 0)]);
    };
    place();
    map.on('move', place);
    return () => {
      map.off('move', place);
      items.forEach((it) => it.marker.remove());
    };
  }, [ready, stations, selId, fun]);

  // Fun mode: a bobbing vessel on top of every pillar (duck = normal, boat = watch, submarine = critical)
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!ready || !map || !gl || !fun) return;
    const items = stations
      .filter((s) => !isStale(s))
      .map((st) => {
        const kind = funKind(st);
        const el = document.createElement('div');
        el.className = `fun-icon fun-${kind}`;
        el.style.setProperty('--dur', st.trend === 'rising' ? '1.5s' : st.trend === 'falling' ? '3.2s' : '2.3s');
        el.innerHTML = `<div class="fun-bob">${funIconSvg(kind)}</div>`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          propsRef.current.onSelect?.(st);
        });
        const marker = new gl.Marker({ element: el, anchor: 'bottom' }).setLngLat([Number(st.lng), Number(st.lat)]).addTo(map);
        return { st, marker };
      });
    const place = () => {
      for (const { st, marker } of items) marker.setOffset([0, -liftPx(map, st) + 6]);
    };
    place();
    map.on('move', place);
    return () => {
      map.off('move', place);
      items.forEach((it) => it.marker.remove());
    };
  }, [ready, stations, fun]);

  // "My location" dot
  useEffect(() => {
    const map = mapRef.current;
    userRef.current?.remove();
    userRef.current = null;
    if (!ready || !map || !userPos || !glRef.current) return;
    const dot = document.createElement('div');
    dot.style.cssText = 'width:16px;height:16px;border-radius:9999px;background:#38bdf8;border:2px solid #fff;box-shadow:0 0 0 6px rgba(56,189,248,.25)';
    userRef.current = new glRef.current.Marker({ element: dot }).setLngLat([userPos[1], userPos[0]]).addTo(map);
  }, [ready, userPos]);

  return <div ref={box} role="application" aria-label="แผนที่ 3 มิติ" style={{ position: 'absolute', inset: 0 }} />;
}