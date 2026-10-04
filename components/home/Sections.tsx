'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, LocateFixed, Search } from 'lucide-react';
import { Station, fmtChange, fmtTime, haversineKm, isStale } from '@/lib/station';
import type { Snapshot } from '@/lib/history';
import { DISTRICTS, DistrictId, districtOf } from '@/lib/districts';
import { STATUS, TREND, card, kOf, sub } from '@/lib/ui';
import { StationCard } from './StationCard';

export type Filter = 'all' | 'rising' | 'falling' | 'warning' | 'critical' | 'stale';
export type Sort = 'capacity' | 'change' | 'level' | 'name' | 'updated';
export type AreaId = 'near' | DistrictId;

export function SectionHead({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mb-6 md:mb-8">
      <p className="text-sm font-medium text-[#8fd3f4]">{eyebrow}</p>
      <h2 className="mt-1.5 text-3xl font-bold leading-tight tracking-tight md:text-4xl">{title}</h2>
      {desc && <p className="mt-2 max-w-2xl text-zinc-300">{desc}</p>}
    </div>
  );
}

interface Common {
  history: Snapshot[];
  replay: number | null;
  selectedId: string | number | null;
  onPick: (s: Station) => void;
}

/* ------------------------------ ย่านของฉัน ------------------------------ */
export function MyArea({
  stations, area, onArea, userPos, onLocate, history, replay, selectedId, onPick,
}: Common & { stations: Station[]; area: AreaId; onArea: (a: AreaId) => void; userPos: [number, number] | null; onLocate: () => void }) {
  const byDistrict = useMemo(() => {
    const m: Record<DistrictId, Station[]> = { mueang: [], amphawa: [], bangkhonthi: [] };
    stations.forEach((s) => m[districtOf(s)].push(s));
    return m;
  }, [stations]);

  const rows = useMemo(() => {
    if (area === 'near') {
      if (!userPos) return [];
      return stations
        .filter((s) => !isStale(s))
        .map((s) => ({ s, km: haversineKm(userPos, [s.lat, s.lng]) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 3);
    }
    return [...byDistrict[area]].sort((a, b) => Number(b.capacityPercent) - Number(a.capacityPercent)).map((s) => ({ s, km: undefined as number | undefined }));
  }, [area, userPos, stations, byDistrict]);

  const worst = (list: Station[]) => (list.some((s) => kOf(s) === 'critical') ? 'bg-red-400' : list.some((s) => kOf(s) === 'warning') ? 'bg-amber-300' : list.some((s) => kOf(s) !== 'stale') ? 'bg-emerald-400' : 'bg-zinc-500');
  const cur = area === 'near' ? stations : byDistrict[area];
  const c = (k: string) => cur.filter((s) => kOf(s) === k).length;

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <button onClick={() => (userPos ? onArea('near') : onLocate())} aria-pressed={area === 'near'}
          className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${area === 'near' ? 'bg-[#8fd3f4] text-[#06242a]' : 'bg-white/[0.06] text-zinc-100 hover:bg-white/10'}`}>
          <LocateFixed className="size-4" /> ใกล้ฉัน
        </button>
        {DISTRICTS.map((d) => (
          <button key={d.id} onClick={() => onArea(d.id)} aria-pressed={area === d.id}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${area === d.id ? 'bg-[#8fd3f4] text-[#06242a]' : 'bg-white/[0.06] text-zinc-100 hover:bg-white/10'}`}>
            <span className={`size-2 rounded-full ${worst(byDistrict[d.id])}`} />
            {d.name}
            <span className="tabular-nums opacity-70">{byDistrict[d.id].length}</span>
          </button>
        ))}
      </div>

      {area === 'near' && !userPos ? (
        <div className={`${card} mt-5 flex flex-col items-start gap-4 p-6`}>
          <p className="text-zinc-200">อนุญาตให้ใช้ตำแหน่งของคุณ เพื่อดูคลองและสถานีวัดน้ำที่ใกล้บ้านที่สุด ตำแหน่งไม่ถูกบันทึกหรือส่งไปที่ไหน</p>
          <button onClick={onLocate} className="btn-primary flex items-center gap-2 rounded-full px-5 py-3 text-sm"><LocateFixed className="size-4" /> หาสถานีใกล้ฉัน</button>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-zinc-300">
            {area === 'near' ? 'สถานีที่ใกล้ที่สุด 3 จุด' : `อำเภอ${DISTRICTS.find((d) => d.id === area)?.name} ${cur.length} จุดวัด`}
            {area !== 'near' && (
              <>
                {' '}เฝ้าระวัง <b className={STATUS.warning.text}>{c('warning')}</b> วิกฤต <b className={STATUS.critical.text}>{c('critical')}</b> ไม่ส่งค่า <b className="text-zinc-200">{c('stale')}</b>
              </>
            )}
          </p>
          {rows.length === 0 ? (
            <p className={`${sub} mt-4 p-6 text-center text-zinc-400`}>ยังไม่มีสถานีวัดน้ำในพื้นที่นี้</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(({ s, km }) => (
                <StationCard key={s.id} st={s} history={history} replay={replay} selected={selectedId === s.id} onPick={onPick} distanceKm={km} />
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-zinc-500">การจัดกลุ่มอำเภอประมาณจากตำแหน่งของสถานี ไม่ใช่เขตแดนทางการ</p>
        </>
      )}
    </div>
  );
}

/* -------------------------------- ภาพรวม -------------------------------- */
export function Overview({
  counts, avg, top, movers, onFilter, onPick,
}: {
  counts: { critical: number; warning: number; normal: number; stale: number; rising: number; falling: number; stable: number };
  avg: number;
  top: Station | null;
  movers: { rising: Station[]; falling: Station[]; hasDelta: boolean };
  onFilter: (f: Filter) => void;
  onPick: (s: Station) => void;
}) {
  const total = counts.rising + counts.falling + counts.stable || 1;
  const stat = (k: 'critical' | 'warning' | 'normal' | 'stale', label: string, f: Filter | null) => (
    <button key={k} onClick={() => f && onFilter(f)} className={`${card} p-5 text-left transition hover:bg-white/[0.07] ${k === 'critical' && counts.critical ? 'shadow-[0_0_34px_-10px_rgba(255,93,93,0.7)]' : ''}`}>
      <div className={`text-5xl font-bold tabular-nums ${STATUS[k].text}`}>{counts[k]}</div>
      <div className="mt-2 text-sm text-zinc-300">{label}</div>
    </button>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
        {stat('critical', 'ถึงระดับวิกฤต', 'critical')}
        {stat('warning', 'เกินระดับเฝ้าระวัง', 'warning')}
        {stat('normal', 'ระดับปกติ', null)}
        {stat('stale', 'ไม่ส่งค่า > 3 ชม.', 'stale')}
      </div>

      <div className={`${card} p-5 lg:row-span-2`}>
        <div className="text-sm text-zinc-300">ระดับน้ำเฉลี่ยทุกสถานี</div>
        <div className="mt-2 text-5xl font-bold tabular-nums">{avg.toFixed(0)}<span className="text-2xl text-zinc-400">%</span></div>
        <div className="text-sm text-zinc-400">ของความสูงตลิ่ง</div>
        <div className="mt-5 text-sm text-zinc-300">ทิศทางของน้ำ</div>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`กำลังขึ้น ${counts.rising} กำลังลด ${counts.falling} ทรงตัว ${counts.stable}`}>
          {(['rising', 'stable', 'falling'] as const).map((t) => <div key={t} className={TREND[t].bg} style={{ width: `${(counts[t] / total) * 100}%` }} />)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {(['rising', 'falling', 'stable'] as const).map((t) => {
            const T = TREND[t];
            return (
              <button key={t} onClick={() => t !== 'stable' && onFilter(t)} className="rounded-xl p-2 text-left transition hover:bg-white/5">
                <div className={`flex items-center gap-1 text-2xl font-semibold tabular-nums ${T.text}`}><T.Icon className="size-4" />{counts[t]}</div>
                <div className="mt-0.5 text-xs text-zinc-400">{T.label}</div>
              </button>
            );
          })}
        </div>
        {top && (
          <button onClick={() => onPick(top)} className={`${sub} mt-5 flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.07]`}>
            <div className="min-w-0">
              <div className="text-xs text-zinc-400">น้ำใกล้ตลิ่งที่สุด</div>
              <div className="mt-1 truncate text-sm font-medium">{top.name}</div>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${STATUS[kOf(top)].text}`}>{top.capacityPercent}%</div>
          </button>
        )}
      </div>

      {([['rising', 'ขึ้นเร็วที่สุด', movers.rising], ['falling', 'ลดเร็วที่สุด', movers.falling]] as const).map(([t, title, items]) => (
        <div key={t} className={`${card} p-5`}>
          <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${TREND[t].text}`}>
            {t === 'rising' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
            {movers.hasDelta ? title : `${TREND[t].label} ใกล้ตลิ่งที่สุด`}
          </h3>
          {items.length === 0 ? <p className="mt-3 text-sm text-zinc-500">ไม่มีสถานีในกลุ่มนี้</p> : (
            <ul className="mt-2 divide-y divide-white/5">
              {items.map((s) => (
                <li key={s.id}>
                  <button onClick={() => onPick(s)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm text-zinc-200 hover:text-white">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-zinc-400">{movers.hasDelta ? fmtChange(s.change6h) : `${s.capacityPercent}%`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- ย้อนหลัง -------------------------------- */
export function HistoryChart({ stations, history, replay, selectedId, onSelect }: {
  stations: Station[]; history: Snapshot[]; replay: number | null; selectedId: string | number | null; onSelect: (id: string) => void;
}) {
  const live = stations.filter((s) => !isStale(s));
  const st = stations.find((s) => s.id === selectedId) ?? live[0] ?? stations[0];
  const data = useMemo(
    () => (st ? history.map((h) => ({ t: h.t, level: h.d[String(st.id)]?.[0] })).filter((p) => p.level != null) as { t: number; level: number }[] : []),
    [history, st]
  );
  if (!st) return null;
  if (history.length < 2 || data.length < 2) {
    return <div className={`${card} p-8 text-center text-zinc-400`}>กำลังเก็บข้อมูลย้อนหลัง ({history.length} ครั้ง) กราฟจะปรากฏเมื่อมีข้อมูลอย่างน้อย 2 ครั้ง</div>;
  }
  const hi = data.reduce((a, b) => (b.level > a.level ? b : a));
  const lo = data.reduce((a, b) => (b.level < a.level ? b : a));
  const marker = history[replay ?? history.length - 1]?.t;
  const hhmm = (t: number) => fmtTime(new Date(t).toISOString());
  const top = Math.max(Number(st.bankHeight) * 1.08, hi.level * 1.05);

  return (
    <div className={`${card} p-5 md:p-6`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select value={String(st.id)} onChange={(e) => onSelect(e.target.value)} aria-label="เลือกสถานี"
          className="w-full rounded-xl bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-1 ring-white/10 sm:max-w-md">
          {stations.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </select>
        <div className="flex gap-5 text-sm tabular-nums">
          <div><div className="text-xs text-zinc-400">สูงสุด</div><b>{hi.level.toFixed(2)} ม.</b> <span className="text-zinc-400">{hhmm(hi.t)} น.</span></div>
          <div><div className="text-xs text-zinc-400">ต่ำสุด</div><b>{lo.level.toFixed(2)} ม.</b> <span className="text-zinc-400">{hhmm(lo.t)} น.</span></div>
        </div>
      </div>
      <div className="mt-5 h-64 w-full md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8fd3f4" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#8fd3f4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} tickFormatter={(v) => hhmm(Number(v))} stroke="#7f9ca4" fontSize={11} tickLine={false} minTickGap={36} />
            <YAxis domain={[0, top]} stroke="#7f9ca4" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => Number(v).toFixed(1)} />
            <Tooltip contentStyle={{ backgroundColor: '#0c1f26', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12 }} labelStyle={{ color: '#9fb8bf' }}
              labelFormatter={(v) => `${hhmm(Number(v))} น.`} formatter={(v) => [`${v} ม.`, 'ระดับน้ำ']} />
            <ReferenceLine y={Number(st.bankHeight)} stroke="#ff6b6b" strokeDasharray="6 5" label={{ value: 'ตลิ่ง', position: 'insideTopLeft', fill: '#ff8a8a', fontSize: 11 }} />
            <ReferenceLine y={Number(st.bankHeight) * 0.7} stroke="#f7c35c" strokeDasharray="3 6" strokeOpacity={0.6} />
            <Area type="monotone" dataKey="level" stroke="#8fd3f4" strokeWidth={2} fill="url(#histFill)" isAnimationActive={false} />
            {marker != null && <ReferenceLine x={marker} stroke="#e8f1ef" strokeDasharray="4 4" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-zinc-500">เส้นประสีแดงคือระดับตลิ่ง เส้นประสีเหลืองคือระดับเฝ้าระวัง (70%) เส้นขาวคือช่วงเวลาที่กำลังดูอยู่</p>
    </div>
  );
}

/* ------------------------------- ทุกจุดวัด ------------------------------- */
export function StationsSection({
  list, counts, total, filter, onFilter, sort, onSort, search, onSearch, loading, history, replay, selectedId, onPick,
}: Common & {
  list: Station[]; counts: { rising: number; falling: number; warning: number; critical: number; stale: number }; total: number;
  filter: Filter; onFilter: (f: Filter) => void; sort: Sort; onSort: (s: Sort) => void; search: string; onSearch: (s: string) => void; loading: boolean;
}) {
  const pills: [Filter, string, number][] = [
    ['all', 'ทั้งหมด', total], ['critical', 'วิกฤต', counts.critical], ['warning', 'เฝ้าระวัง', counts.warning],
    ['rising', 'กำลังขึ้น', counts.rising], ['falling', 'กำลังลด', counts.falling], ['stale', 'ไม่ส่งค่า', counts.stale],
  ];
  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="ค้นหาสถานีหรือชื่อคลอง" aria-label="ค้นหาสถานี"
            className="w-full rounded-2xl bg-white/[0.06] py-3.5 pl-11 pr-4 text-sm outline-none ring-1 ring-white/10 placeholder:text-zinc-400 focus:ring-[#8fd3f4]/60" />
        </div>
        <select value={sort} onChange={(e) => onSort(e.target.value as Sort)} aria-label="เรียงตาม"
          className="rounded-2xl bg-zinc-900/80 px-4 py-3.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10 md:w-64">
          <option value="capacity">เรียงตามความใกล้ตลิ่ง</option>
          <option value="change">เรียงตามเปลี่ยนแปลงมากสุด</option>
          <option value="level">เรียงตามระดับน้ำสูงสุด</option>
          <option value="updated">เรียงตามอัปเดตล่าสุด</option>
          <option value="name">เรียงตามชื่อ ก-ฮ</option>
        </select>
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {pills.map(([k, label, n]) => (
          <button key={k} onClick={() => onFilter(k)} aria-pressed={filter === k}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${filter === k ? 'bg-[#8fd3f4] font-semibold text-[#06242a]' : 'bg-white/[0.06] text-zinc-200 hover:bg-white/10'}`}>
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !total
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-white/5" />)
          : list.map((st) => <StationCard key={st.id} st={st} history={history} replay={replay} selected={selectedId === st.id} onPick={onPick} />)}
      </div>
      {!loading && list.length === 0 && <p className="py-12 text-center text-zinc-400">ไม่พบสถานีที่ตรงกับการค้นหา ลองล้างตัวกรอง</p>}
    </div>
  );
}