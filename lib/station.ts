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
}

export type ColorBy = 'level' | 'trend';

export const STALE_MS = 3 * 60 * 60 * 1000;

export const isStale = (s: Station) =>
  !s.updatedAt || Date.now() - new Date(s.updatedAt).getTime() > STALE_MS;

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