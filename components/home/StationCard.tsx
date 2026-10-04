'use client';

import { Station, COLORS, fmtChange, fmtTime } from '@/lib/station';
import type { Snapshot } from '@/lib/history';
import { Key, STATUS, kOf, tOf } from '@/lib/ui';

export function Gauge({ pct, k }: { pct: number; k: Key }) {
  return (
    <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full ${STATUS[k].bar} transition-[width] duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
      {/* thresholds: 70% watch, 90% critical */}
      <span className="absolute inset-y-0 left-[70%] w-px bg-white/30" />
      <span className="absolute inset-y-0 left-[90%] w-px bg-white/30" />
    </div>
  );
}

export function TrendLabel({ st, showChange = true }: { st: Station; showChange?: boolean }) {
  const t = tOf(st);
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${t.text}`}>
      <t.Icon className="size-3" />
      {t.label}
      {showChange && st.change6h != null && <span className="text-zinc-300 tabular-nums">{fmtChange(st.change6h)}</span>}
    </span>
  );
}

/** Tiny 24 h capacity trend; the dot marks the moment being shown. */
export function Spark({ id, history, at, color }: { id: string; history: Snapshot[]; at: number | null; color: string }) {
  const pts = history.map((x) => x.d[id]?.[1]);
  const vals = pts.filter((v): v is number => v != null);
  if (vals.length < 2) return <span className="w-24" />;
  const lo = Math.min(...vals);
  const span = Math.max(Math.max(...vals) - lo, 6);
  const W = 96, Hh = 22, n = pts.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => Hh - 3 - ((v - lo) / span) * (Hh - 6);
  let d = '';
  pts.forEach((v, i) => {
    if (v == null) return;
    d += `${d && pts[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  const cur = at ?? n - 1;
  const cv = pts[cur];
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="h-[22px] w-24 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      {cv != null && <circle cx={x(cur)} cy={y(cv)} r="2.6" fill={color} stroke="#071219" strokeWidth="1.2" />}
    </svg>
  );
}

export function StationCard({
  st, history, replay, selected, onPick, distanceKm,
}: {
  st: Station; history: Snapshot[]; replay: number | null; selected?: boolean; onPick: (s: Station) => void; distanceKm?: number;
}) {
  const k = kOf(st);
  const pct = Number(st.capacityPercent) || 0;
  const glow = k === 'critical' ? 'shadow-[0_0_24px_-8px_rgba(255,93,93,0.7)]' : '';
  return (
    <button onClick={() => onPick(st)}
      className={`w-full text-left rounded-2xl p-4 ring-1 transition active:scale-[0.99] ${glow} ${selected ? 'bg-white/10 ring-cyan-400/50' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.08]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium leading-snug">{st.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <TrendLabel st={st} />
            <span className="text-[11px] text-zinc-400 tabular-nums">{fmtTime(st.updatedAt)} น.</span>
            {distanceKm != null && <span className="text-[11px] text-cyan-300 tabular-nums">ห่าง {distanceKm.toFixed(1)} กม.</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-semibold tabular-nums leading-none ${STATUS[k].text}`}>{st.capacityPercent}%</div>
          <span className={`mt-1.5 inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium ${STATUS[k].chip}`}>{STATUS[k].label}</span>
        </div>
      </div>
      <div className="mt-3"><Gauge pct={pct} k={k} /></div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-400 tabular-nums">
        <span>น้ำ {st.waterLevel} ม.</span>
        <Spark id={String(st.id)} history={history} at={replay} color={COLORS[k]} />
        <span>ตลิ่ง {st.bankHeight} ม.</span>
      </div>
    </button>
  );
}