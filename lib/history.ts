import { Station, isStale } from './station';

export const HISTORY_KEY = 'flood:history';
/** 15-minute readings: 96 cover 24 hours; a few extra absorb timing jitter. */
export const HISTORY_MAX = 100;

/** [water level m, capacity %, status 0 normal / 1 warning / 2 critical, trend -1 falling / 0 stable / 1 rising] */
export type Tuple = [number, number, number, number];
export interface Snapshot {
  t: number; // epoch ms
  d: Record<string, Tuple>; // by station id
}

const STATUS = ['normal', 'warning', 'critical'] as const;

/** Compact snapshot of the stations that are currently reporting. */
export function buildSnapshot(stations: Station[], t: number): Snapshot {
  const d: Record<string, Tuple> = {};
  for (const s of stations) {
    const level = Number(s.waterLevel);
    const pct = Number(s.capacityPercent);
    if (!Number.isFinite(level) || !Number.isFinite(pct) || isStale(s)) continue;
    d[String(s.id)] = [
      +level.toFixed(2),
      +pct.toFixed(1),
      s.status === 'critical' ? 2 : s.status === 'warning' ? 1 : 0,
      s.trend === 'rising' ? 1 : s.trend === 'falling' ? -1 : 0,
    ];
  }
  return { t, d };
}

/** The station as it was at the snapshot. Stations that weren't reporting then show as "no data". */
export function applySnapshot(s: Station, snap: Snapshot): Station {
  const tu = snap.d[String(s.id)];
  if (!tu) return { ...s, updatedAt: '', asOf: snap.t };
  return {
    ...s,
    waterLevel: tu[0],
    capacityPercent: tu[1],
    status: STATUS[tu[2]] ?? 'normal',
    trend: tu[3] > 0 ? 'rising' : tu[3] < 0 ? 'falling' : 'stable',
    updatedAt: new Date(snap.t).toISOString(),
    asOf: snap.t,
  };
}

/** Level change versus about 6 hours before snapshot `idx`; undefined if there isn't a reading that old. */
export function sixHourChange(hist: Snapshot[], idx: number, id: string, level: number): number | undefined {
  if (!hist[idx]) return undefined;
  const target = hist[idx].t - 6 * 3600e3;
  for (let i = idx; i >= 0; i--) {
    if (hist[i].t <= target) {
      if (target - hist[i].t > 40 * 60e3) return undefined; // gap in the data
      const old = hist[i].d[id]?.[0];
      return old == null ? undefined : +(level - old).toFixed(2);
    }
  }
  return undefined;
}

/** Rising or falling from the last hour of saved readings, for sources that don't report a trend themselves. */
export function recentTrend(hist: Snapshot[], idx: number, id: string, level: number): 'rising' | 'falling' | 'stable' | undefined {
  if (!hist[idx]) return undefined;
  const target = hist[idx].t - 60 * 60e3;
  for (let i = idx; i >= 0; i--) {
    if (hist[i].t <= target) {
      if (target - hist[i].t > 40 * 60e3) return undefined; // gap in the data
      const old = hist[i].d[id]?.[0];
      if (old == null) return undefined;
      const d = level - old;
      return d > 0.03 ? 'rising' : d < -0.03 ? 'falling' : 'stable';
    }
  }
  return undefined;
}