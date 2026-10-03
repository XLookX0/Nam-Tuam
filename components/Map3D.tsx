'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Station, ColorBy, markerColor, pillarHeight, circlePolygon, fmtTime, PILLAR_FULL_M } from '@/lib/station';
import type { MapProps } from './Map';

// Next.js/Turbopack doesn't emit MapLibre's built-in worker correctly (the browser gets an HTML 404 instead of JS).
// Serve the worker ourselves from /public. See: public/maplibre-gl-csp-worker.js
maplibregl.setWorkerUrl('/maplibre-gl-csp-worker.js');

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
] as unknown as maplibregl.ExpressionSpecification;

/** OpenFreeMap's "dark" style is almost black on black. Recolour it to the dashboard's deep teal-navy so roads, water and labels read. */
function retheme(map: maplibregl.Map, layers: maplibregl.LayerSpecification[]) {
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
      if (res.ok) return (await res.json()) as maplibregl.StyleSpecification;
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
  const { stations, selectedStation, focusKey, colorBy = 'level', userPos } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const userRef = useRef<maplibregl.Marker | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | undefined;

    (async () => {
      if (!webglOk()) return propsRef.current.onUnsupported?.();
      const style = await loadStyle();
      if (cancelled || !box.current) return;
      if (!style) return propsRef.current.onUnsupported?.();

      map = new maplibregl.Map({
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

        map.addSource(SRC, { type: 'geojson', data: buildData(propsRef.current.stations, propsRef.current.colorBy ?? 'level') });
        map.addLayer({
          id: 'bank-tubes',
          type: 'fill-extrusion',
          source: SRC,
          filter: ['==', ['get', 'kind'], 'bank'],
          paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': HEIGHT_EXPR, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.16 },
        });
        map.addLayer({
          id: 'water-pillars',
          type: 'fill-extrusion',
          source: SRC,
          filter: ['==', ['get', 'kind'], 'water'],
          paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': HEIGHT_EXPR, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 },
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
    const src = mapRef.current?.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (ready && src) src.setData(buildData(stations, colorBy));
  }, [ready, stations, colorBy]);

  // Fly to the selected station and show its popup
  const selId = selectedStation?.id;
  useEffect(() => {
    popupRef.current?.remove();
    popupRef.current = null;
    const map = mapRef.current;
    const st = propsRef.current.selectedStation;
    if (!ready || !map || !st) return;
    const lngLat: [number, number] = [Number(st.lng), Number(st.lat)];
    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 13.2), pitch: 62, duration: 1400, essential: true });
    popupRef.current = new maplibregl.Popup({ offset: 12, maxWidth: '280px', closeOnClick: false })
      .setLngLat(lngLat)
      .setHTML(popupHtml(st))
      .addTo(map);
  }, [ready, selId, focusKey]);

  // "My location" dot
  useEffect(() => {
    const map = mapRef.current;
    userRef.current?.remove();
    userRef.current = null;
    if (!ready || !map || !userPos) return;
    const dot = document.createElement('div');
    dot.style.cssText = 'width:16px;height:16px;border-radius:9999px;background:#38bdf8;border:2px solid #fff;box-shadow:0 0 0 6px rgba(56,189,248,.25)';
    userRef.current = new maplibregl.Marker({ element: dot }).setLngLat([userPos[1], userPos[0]]).addTo(map);
  }, [ready, userPos]);

  return <div ref={box} role="application" aria-label="แผนที่ 3 มิติ" style={{ position: 'absolute', inset: 0 }} />;
}