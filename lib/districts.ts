import type { Station } from './station';

export type DistrictId = 'mueang' | 'amphawa' | 'bangkhonthi';

/** Approximate district centres. Stations are assigned to the nearest one, so the grouping is by location, not by official boundary. */
export const DISTRICTS: { id: DistrictId; name: string; short: string; lat: number; lng: number }[] = [
  { id: 'mueang', name: 'เมืองสมุทรสงคราม', short: 'เมือง', lat: 13.395, lng: 100.005 },
  { id: 'amphawa', name: 'อัมพวา', short: 'อัมพวา', lat: 13.42, lng: 99.957 },
  { id: 'bangkhonthi', name: 'บางคนที', short: 'บางคนที', lat: 13.46, lng: 99.945 },
];

export function districtOf(s: Pick<Station, 'lat' | 'lng'>): DistrictId {
  const k = Math.cos((13.4 * Math.PI) / 180);
  let best = DISTRICTS[0];
  let bestD = Infinity;
  for (const d of DISTRICTS) {
    const dist = (Number(s.lat) - d.lat) ** 2 + ((Number(s.lng) - d.lng) * k) ** 2;
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best.id;
}