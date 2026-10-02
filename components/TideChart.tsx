'use client';

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, CartesianGrid } from 'recharts';

interface TideData {
  peaks: Array<{ time: string; height: number }>;
  lows: Array<{ time: string; height: number }>;
}
type Ext = { t: number; h: number; kind: 'high' | 'low' };

const toMin = (s: string) => {
  const m = s.match(/(\d{1,2})[:.](\d{2})/);
  return m ? +m[1] * 60 + +m[2] : NaN;
};
const fmt = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
const bangkokNow = () =>
  toMin(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(new Date())
  );

/** Cosine-interpolate between high/low tides. The result is an estimate, not a forecast. */
function buildCurve(ext: Ext[]) {
  if (ext.length < 2) return [];
  const first = ext[0], second = ext[1], last = ext[ext.length - 1], prev = ext[ext.length - 2];
  const all: Ext[] = [
    { t: first.t - (second.t - first.t), h: second.h, kind: second.kind },
    ...ext,
    { t: last.t + (last.t - prev.t), h: prev.h, kind: prev.kind },
  ];
  const pts: { t: number; level: number }[] = [];
  for (let t = 0; t <= 1440; t += 15) {
    const i = all.findIndex((x, idx) => idx < all.length - 1 && t >= x.t && t <= all[idx + 1].t);
    if (i < 0) continue;
    const p = all[i], q = all[i + 1];
    const f = (t - p.t) / (q.t - p.t || 1);
    pts.push({ t, level: +(p.h + ((q.h - p.h) * (1 - Math.cos(Math.PI * f))) / 2).toFixed(2) });
  }
  return pts;
}

export default function TideChart({ tides }: { tides: TideData | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(bangkokNow());
    const id = setInterval(() => setNow(bangkokNow()), 60000);
    return () => clearInterval(id);
  }, []);

  const { ext, curve } = useMemo(() => {
    if (!tides) return { ext: [] as Ext[], curve: [] };
    const e: Ext[] = [
      ...tides.peaks.map((p) => ({ t: toMin(p.time), h: Number(p.height), kind: 'high' as const })),
      ...tides.lows.map((l) => ({ t: toMin(l.time), h: Number(l.height), kind: 'low' as const })),
    ]
      .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.h))
      .sort((a, b) => a.t - b.t);
    return { ext: e, curve: buildCurve(e) };
  }, [tides]);

  if (!tides || ext.length === 0) {
    return <div className="text-sm text-[#7f9ca4] py-6 text-center">ยังไม่มีข้อมูลน้ำขึ้นน้ำลงของวันนี้</div>;
  }

  const current = now != null ? curve.reduce((a, b) => (Math.abs(b.t - now) < Math.abs(a.t - now) ? b : a), curve[0]) : null;
  const nextHigh = now != null ? ext.find((x) => x.kind === 'high' && x.t > now) : undefined;
  const nextLow = now != null ? ext.find((x) => x.kind === 'low' && x.t > now) : undefined;

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
      <div className="text-xs text-[#7f9ca4]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-[#9fb8bf] tabular-nums">{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {stat('ตอนนี้ (ประมาณ)', current ? `${current.level.toFixed(2)} ม.` : '-')}
        {stat('น้ำขึ้นสูงสุดถัดไป', nextHigh ? `${fmt(nextHigh.t)} น.` : 'ผ่านแล้ววันนี้', nextHigh ? `${nextHigh.h} ม.` : undefined)}
        {stat('น้ำลงต่ำสุดถัดไป', nextLow ? `${fmt(nextLow.t)} น.` : 'ผ่านแล้ววันนี้', nextLow ? `${nextLow.h} ม.` : undefined)}
      </div>

      <div className="w-full h-52 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve} margin={{ top: 16, right: 12, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4fd1c5" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#4fd1c5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              type="number"
              dataKey="t"
              domain={[0, 1440]}
              ticks={[0, 360, 720, 1080, 1440]}
              tickFormatter={(v) => (v === 1440 ? '24:00' : fmt(v))}
              stroke="#7f9ca4"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="#7f9ca4"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={['dataMin - 0.2', 'dataMax + 0.2']}
              tickFormatter={(v) => Number(v).toFixed(1)}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0c1f26', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12 }}
              labelStyle={{ color: '#9fb8bf' }}
              labelFormatter={(v) => `${fmt(Number(v))} น.`}
              formatter={(val) => [`${val} ม.`, 'ระดับน้ำทะเล (ประมาณ)']}
            />
            <Area type="monotone" dataKey="level" stroke="#4fd1c5" strokeWidth={2} fill="url(#tideGradient)" isAnimationActive={false} />
            {ext
              .filter((x) => x.t >= 0 && x.t <= 1440)
              .map((x) => (
                <ReferenceDot
                  key={`${x.kind}-${x.t}`}
                  x={x.t}
                  y={x.h}
                  r={4}
                  fill={x.kind === 'high' ? '#ff7a59' : '#4fd1c5'}
                  stroke="#071219"
                  strokeWidth={2}
                  label={{ value: `${x.h}`, position: x.kind === 'high' ? 'top' : 'bottom', fill: '#cfe3e0', fontSize: 11 }}
                />
              ))}
            {now != null && (
              <ReferenceLine
                x={now}
                stroke="#e8f1ef"
                strokeDasharray="4 4"
                className="tide-now"
                label={{ value: 'ตอนนี้', position: 'insideTopRight', fill: '#e8f1ef', fontSize: 11 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[#7f9ca4]">จุดสีส้มคือน้ำขึ้นสูงสุด จุดสีเขียวน้ำเงินคือน้ำลงต่ำสุด เส้นระหว่างจุดเป็นค่าประมาณ</p>
    </div>
  );
}