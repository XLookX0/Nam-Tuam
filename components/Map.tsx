'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowUp, ArrowDown, Minus, ExternalLink } from 'lucide-react';
import { Station, ColorBy, CameraMode, MapLayers, isStale, markerColor, fmtTime, fmtChange } from '@/lib/station';
import 'leaflet/dist/leaflet.css';

export type { Station } from '@/lib/station';

export interface MapProps {
  stations: Station[];
  selectedStation: Station | null;
  /** Bump this number to re-focus the same station on repeated taps. */
  focusKey?: number;
  colorBy?: ColorBy;
  userPos?: [number, number] | null;
  /** Used by the 3D map: called when a pillar is clicked. */
  onSelect?: (s: Station) => void;
  /** Used by the 3D map: called when WebGL or the 3D style can't load, so the page can fall back to 2D. */
  onUnsupported?: () => void;
  /** 3D only: camera preset request. Bump `key` to re-trigger the same mode. */
  camera?: { mode: CameraMode | null; key: number } | null;
  /** 3D only: basemap layer visibility. */
  layers?: MapLayers;
  /** 3D only: the map ended a camera mode itself (e.g. the user grabbed the map during the tour). */
  onCameraEnd?: () => void;
}

const CENTER: [number, number] = [13.4093, 100.0022];
const BOUNDS: L.LatLngBoundsExpression = [
  [13.2, 99.75],
  [13.65, 100.25],
];

const iconCache = new globalThis.Map<string, L.DivIcon>();
function makeIcon(color: string, critical: boolean, stale: boolean) {
  const key = `${color}|${critical}|${stale}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="${critical ? 'marker-critical-dot' : ''}" style="width:20px;height:20px;border-radius:9999px;box-sizing:border-box;background:${
        stale ? 'transparent' : color
      };border:2px solid ${stale ? color : 'rgba(255,255,255,.85)'};box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function Controller({
  selected,
  focusKey,
  markers,
}: {
  selected: Station | null;
  focusKey?: number;
  markers: React.MutableRefObject<globalThis.Map<string | number, L.Marker>>;
}) {
  const map = useMap();
  const latest = useRef(selected);
  latest.current = selected;
  const id = selected?.id;

  useEffect(() => {
    const st = latest.current;
    if (!st) return;
    const open = () => markers.current.get(st.id)?.openPopup();
    const ll = L.latLng(Number(st.lat), Number(st.lng));
    // Don't yank the map around if the station is already comfortably in view
    if (map.getZoom() >= 13 && map.getBounds().contains(ll)) {
      open();
      return;
    }
    map.once('moveend', open);
    map.flyTo(ll, 14, { duration: 1.2 });
    return () => {
      map.off('moveend', open);
    };
  }, [id, focusKey, map, markers]);

  return null;
}

export default function FloodMap({ stations, selectedStation, focusKey, colorBy = 'level', userPos }: MapProps) {
  const markers = useRef(new globalThis.Map<string | number, L.Marker>());

  const items = useMemo(
    () =>
      stations.map((st) => {
        const stale = isStale(st);
        const color = markerColor(st, colorBy);
        return { st, stale, icon: makeIcon(color, colorBy === 'level' && !stale && st.status === 'critical', stale) };
      }),
    [stations, colorBy]
  );

  return (
    <MapContainer
      center={CENTER}
      zoom={12}
      minZoom={10}
      maxBounds={BOUNDS}
      maxBoundsViscosity={0.9}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        url="https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=cb1_47se_1_8b93bc2f9c99b721b2d3608a"
        attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Controller selected={selectedStation} focusKey={focusKey} markers={markers} />

      {userPos && (
        <CircleMarker
          center={userPos}
          radius={8}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 }}
        />
      )}

      {items.map(({ st, stale, icon }) => {
        const pct = Number(st.capacityPercent) || 0;
        const barColor = markerColor(st, 'level');
        return (
          <Marker
            key={st.id}
            position={[Number(st.lat), Number(st.lng)]}
            icon={icon}
            ref={(m) => {
              if (m) markers.current.set(st.id, m);
              else markers.current.delete(st.id);
            }}
          >
            <Popup>
              <div className="space-y-2.5">
                <h3 className="font-semibold text-sm text-zinc-100 leading-snug">{st.name}</h3>
                <div>
                  <div className="flex items-baseline justify-between text-xs text-zinc-400">
                    <span>
                      น้ำ <b className="text-zinc-100">{st.waterLevel} ม.</b> จากตลิ่ง {st.bankHeight} ม.
                    </span>
                    <b className="tabular-nums" style={{ color: barColor }}>
                      {pct}%
                    </b>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400 pt-1.5 border-t border-white/10">
                  <span className="flex items-center gap-1 font-medium text-zinc-200">
                    {st.trend === 'rising' && <ArrowUp className="w-3 h-3 text-red-400" />}
                    {st.trend === 'falling' && <ArrowDown className="w-3 h-3 text-emerald-400" />}
                    {st.trend === 'stable' && <Minus className="w-3 h-3 text-zinc-400" />}
                    {st.trend === 'rising' ? 'กำลังขึ้น' : st.trend === 'falling' ? 'กำลังลด' : 'ทรงตัว'}
                    {st.change6h != null && <span className="text-zinc-400 font-normal">{fmtChange(st.change6h)} ใน 6 ชม.</span>}
                  </span>
                  <span>วัดเมื่อ {fmtTime(st.updatedAt)} น.</span>
                </div>
                {stale && <p className="text-[11px] text-amber-300/90">ไม่ส่งค่าเกิน 3 ชั่วโมง อาจปิดซ่อมหรือสัญญาณขัดข้อง</p>}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${st.lat},${st.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#4fd1c5] hover:underline"
                >
                  เปิดใน Google Maps <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}