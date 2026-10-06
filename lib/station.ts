export interface Station {
  id: number | string;
  name: string;
  lat: number;
  lng: number;
  waterLevel: number;
  bankHeight: number;
  capacityPercent: number;
  status: 'normal' | 'warning' | 'critical';
  trend: 'rising' | 'falling' | 'stable';
  updatedAt: string;
  /** Optional. Level change over the last 6 hours, in metres. Enables "fastest rising/falling". */
  change6h?: number;
  /** Optional. Highest level today, in metres. */
  maxToday?: number;
  /** Set only while replaying history: the timestamp (ms) being shown. */
  asOf?: number;
  /** Metres of room left below the bank top (negative = over the bank). Present for live stations. */
  freeboard?: number;
}

export type ColorBy = 'level' | 'trend';
export type CameraMode = 'city' | 'top' | 'tour';
export interface MapLayers {
  canals: boolean;
  roads: boolean;
  buildings: boolean;
}

export const STALE_MS = 3 * 60 * 60 * 1000;

/** While replaying history, `asOf` is the replayed moment, so staleness is judged against it instead of "now". */
export const isStale = (s: Station) =>
  !s.updatedAt || (s.asOf ?? Date.now()) - new Date(s.updatedAt).getTime() > STALE_MS;

export const COLORS = {
  critical: '#ff5d5d',
  warning: '#f5b544',
  normal: '#3ecf8e',
  rising: '#ff7a59',
  falling: '#4fd1c5',
  stable: '#7f9ca4',
  stale: '#5b6e75',
} as const;

export function markerColor(s: Station, by: ColorBy): string {
  if (isStale(s)) return COLORS.stale;
  if (by === 'trend') return COLORS[s.trend] ?? COLORS.stable;
  return COLORS[s.status] ?? COLORS.normal;
}

export function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const fmtTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      })
    : '-';

export const fmtChange = (v?: number) =>
  v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(2)} ม.`;
/* ---------- 3D map helpers ---------- */

/** Height of a "full" pillar (= water at bank top) in metres. Exaggerated on purpose so it reads at city zoom. */
export const PILLAR_FULL_M = 3000;

/** Pillar height scales with how close the water is to the bank (capped at 110%). */
export const pillarHeight = (s: Station) =>
  (Math.min(Math.max(Number(s.capacityPercent) || 0, 0), 110) / 100) * PILLAR_FULL_M;

/** Closed GeoJSON ring approximating a circle of `radiusM` metres around lng/lat. */
export function circlePolygon(lng: number, lat: number, radiusM: number, steps = 20): [number, number][][] {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  ring.push(ring[0]);
  return [ring];
}

/**
 * "How full" the channel is, from the room left below the bank top. Unlike level / bank height, this stays correct for
 * gauges measured from a different datum (e.g. water 14.36 m, bank 15.5 m).
 * It lines up with the status thresholds and the 70% / 90% marks: 0.5 m left = 70%, 0.2 m = 90%, bank = 100%, 2 m+ = 0%.
 */
export function fillPct(free: number): number {
  if (free <= 0) return Math.min(110, 100 + Math.min(-free, 0.1) * 100);
  if (free <= 0.2) return 100 - (free / 0.2) * 10;
  if (free <= 0.5) return 90 - ((free - 0.2) / 0.3) * 20;
  return Math.max(0, 70 - ((free - 0.5) / 1.5) * 70);
}

/** Tidy a station as it comes from the API: trimmed name, and a percentage that always agrees with its freeboard. */
export function normalizeStation(s: Station): Station {
  const free = Number(s.freeboard);
  return {
    ...s,
    name: String(s.name ?? '').trim() || 'สถานีตรวจวัด',
    ...(s.freeboard != null && Number.isFinite(free) ? { capacityPercent: Number(fillPct(free).toFixed(2)) } : {}),
  };
}