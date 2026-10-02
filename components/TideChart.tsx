'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface TideData {
  peaks: Array<{ time: string; height: number }>;
  lows: Array<{ time: string; height: number }>;
}

export default function TideChart({ tides }: { tides: TideData | null }) {
  if (!tides) return <div className="text-xs text-zinc-400">ไม่มีข้อมูลน้ำขึ้นน้ำลง</div>;

  // Combine and sort peak/low tide timestamps for chart plotting
  const chartData = [
    ...tides.peaks.map((p) => ({ time: p.time, level: p.height, type: 'น้ำขึ้น' })),
    ...tides.lows.map((l) => ({ time: l.time, level: l.height, type: 'น้ำลง' })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="w-full h-36 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" stroke="#71717a" fontSize={11} tickLine={false} />
          <YAxis stroke="#71717a" fontSize={11} tickLine={false} domain={[0, 3]} />
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '8px' }}
            labelStyle={{ color: '#a1a1aa' }}
            formatter={(val: any) => [`${val} ม.`, 'ระดับน้ำทะเล']}
          />
          <Area type="monotone" dataKey="level" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#tideGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}