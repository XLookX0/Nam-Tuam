'use client';

import { useEffect, useState, useMemo } from 'react';
import MapWrapper from '@/components/MapWrapper';
import TideChart from '@/components/TideChart';
import { Station } from '@/components/Map';
import { Droplets, Search, Waves, RefreshCw } from 'lucide-react';

type Filter = 'all' | 'critical' | 'warning' | 'normal';
type Sort = 'capacity' | 'level' | 'name';

const STATUS = {
  critical: { label: 'วิกฤต', bar: 'bg-[#ff5d5d]', text: 'text-[#ff8a8a]', chip: 'bg-[#ff5d5d]/15 text-[#ff8a8a]' },
  warning: { label: 'เฝ้าระวัง', bar: 'bg-[#f5b544]', text: 'text-[#f7c970]', chip: 'bg-[#f5b544]/15 text-[#f7c970]' },
  normal: { label: 'ปกติ', bar: 'bg-[#3ecf8e]', text: 'text-[#6fe0ac]', chip: 'bg-[#3ecf8e]/15 text-[#6fe0ac]' },
} as const;
type Key = keyof typeof STATUS;
const statusOf = (s: string): Key => (s === 'critical' || s === 'warning' ? s : 'normal');

const NAV = [
  ['ภาพรวม', '#overview'],
  ['แผนที่', '#map'],
  ['น้ำขึ้นน้ำลง', '#tide'],
  ['ทุกสถานี', '#stations'],
];

const panel = 'rounded-3xl bg-[#0d212a] ring-1 ring-white/10';

function Gauge({ pct, k }: { pct: number; k: Key }) {
  return (
    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full ${STATUS[k].bar} transition-[width] duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

/* Canal cross-section: water rises toward the bank top (100%) */
function CanalGauge({ pct, k }: { pct: number; k: Key }) {
  const h = (Math.min(pct, 100) / 100) * 200;
  const y = 230 - h;
  const color = k === 'critical' ? '#ff5d5d' : k === 'warning' ? '#f5b544' : '#4fd1c5';
  return (
    <svg viewBox="0 0 400 260" className="w-full h-auto" role="img" aria-label={`ระดับน้ำเฉลี่ย ${pct.toFixed(0)}% ของตลิ่ง`}>
      <defs>
        <clipPath id="canal"><rect x="70" y="30" width="260" height="200" /></clipPath>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.85" />
          <stop offset="1" stopColor={color} stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <rect x="0" y="30" width="70" height="230" fill="#14323d" />
      <rect x="330" y="30" width="70" height="230" fill="#14323d" />
      <rect x="70" y="230" width="260" height="30" fill="#10282f" />
      <g clipPath="url(#canal)">
        <g style={{ transform: `translateY(${y}px)`, transition: 'transform 1s ease' }}>
          <g className="wave">
            <path d="M-140 6 Q-105 -6 -70 6 T0 6 T70 6 T140 6 T210 6 T280 6 T350 6 T420 6 T490 6 V300 H-140 Z" fill="url(#water)" />
          </g>
        </g>
      </g>
      <line x1="70" y1="30" x2="330" y2="30" stroke="#9fb8bf" strokeDasharray="5 5" strokeOpacity="0.6" />
      <text x="338" y="26" fill="#9fb8bf" fontSize="11">ขอบตลิ่ง</text>
    </svg>
  );
}

export default function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [tides, setTides] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('capacity');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/water-data');
      const data = await res.json();
      setStations(data.waterLevels || []);
      setTides(data.tides || null);
      setLastUpdated(data.lastUpdated || '');
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, normal: 0 };
    stations.forEach((s) => c[statusOf(s.status)]++);
    return c;
  }, [stations]);

  const avg = stations.length ? stations.reduce((a, s) => a + (Number(s.capacityPercent) || 0), 0) / stations.length : 0;
  const top = stations.reduce<Station | null>((m, s) => (!m || Number(s.capacityPercent) > Number(m.capacityPercent) ? s : m), null);
  const overall: Key = counts.critical ? 'critical' : counts.warning ? 'warning' : 'normal';
  const headline = { critical: 'วิกฤตบางจุด', warning: 'ต้องเฝ้าระวัง', normal: 'ปกติ' }[overall];

  const list = useMemo(() => {
    return stations
      .filter((st) => st.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((st) => filter === 'all' || statusOf(st.status) === filter)
      .sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name, 'th')
        : sort === 'level' ? Number(b.waterLevel) - Number(a.waterLevel)
        : Number(b.capacityPercent) - Number(a.capacityPercent)
      );
  }, [stations, searchQuery, filter, sort]);

  const time = lastUpdated ? new Date(lastUpdated).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '...';

  const pick = (st: Station) => {
    setSelectedStation(st);
    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' });
  };

  const chips: [Filter, string, number][] = [
    ['all', 'ทั้งหมด', stations.length],
    ['critical', 'วิกฤต', counts.critical],
    ['warning', 'เฝ้าระวัง', counts.warning],
    ['normal', 'ปกติ', counts.normal],
  ];

  return (
    <main className="min-h-screen bg-[#071219] text-[#e8f1ef]">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 bg-[#071219]/85 backdrop-blur-xl border-b border-white/10">
        <div className="mx-auto max-w-6xl flex items-center gap-4 px-4 h-14">
          <a href="#top" className="flex items-center gap-2 font-semibold shrink-0">
            <span className="grid place-items-center size-8 rounded-lg bg-[#4fd1c5]/15 text-[#4fd1c5]"><Droplets className="size-4" /></span>
            <span className="hidden sm:inline">สมุทรสงคราม Flood</span>
          </a>
          <div className="flex gap-1 overflow-x-auto custom-scrollbar flex-1">
            {NAV.map(([l, h]) => (
              <a key={h} href={h} className="px-3 py-1.5 rounded-full text-sm text-[#9fb8bf] hover:bg-white/10 hover:text-white whitespace-nowrap transition">{l}</a>
            ))}
          </div>
          <button onClick={fetchData} aria-label="รีเฟรชข้อมูล" className="grid place-items-center size-9 rounded-full bg-white/5 hover:bg-white/10 shrink-0">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin text-[#4fd1c5]' : 'text-[#9fb8bf]'}`} />
          </button>
        </div>
      </nav>

      <div id="top" className="mx-auto max-w-6xl px-4 pb-16">
        {/* Hero */}
        <section className="grid md:grid-cols-[1.1fr_0.9fr] gap-8 items-center pt-10 md:pt-16 pb-10">
          <div>
            <p className="text-sm text-[#7f9ca4] flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#3ecf8e] animate-pulse" />
              อัปเดตล่าสุด {time} น. · {stations.length} สถานีวัดน้ำ
            </p>
            <h1 className="mt-4 text-4xl md:text-6xl font-bold leading-[1.15]">
              สมุทรสงคราม
              <br />
              ตอนนี้น้ำ{' '}
              <span className={STATUS[overall].text}>{loading && !stations.length ? '...' : headline}</span>
            </h1>
            <p className="mt-4 text-[#9fb8bf] max-w-md leading-relaxed">
              ดูว่าน้ำสูงใกล้ตลิ่งแค่ไหนในแต่ละสถานี และสถานีไหนต้องระวัง ข้อมูลรีเฟรชทุก 1 นาที
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#map" className="px-5 py-2.5 rounded-full bg-[#4fd1c5] text-[#06242a] font-medium text-sm hover:brightness-110 transition">เปิดแผนที่</a>
              <a href="#stations" className="px-5 py-2.5 rounded-full bg-white/10 font-medium text-sm hover:bg-white/15 transition">ค้นหาสถานีใกล้บ้าน</a>
            </div>
          </div>
          <div className={`${panel} p-5`}>
            <CanalGauge pct={avg} k={overall} />
            <p className="mt-3 text-sm text-[#9fb8bf]">
              ระดับน้ำเฉลี่ยทุกสถานี <span className="text-white font-semibold tabular-nums">{avg.toFixed(0)}%</span> ของความสูงตลิ่ง
            </p>
          </div>
        </section>

        {/* Overview */}
        <section id="overview" className="py-8">
          <h2 className="text-2xl font-semibold">ภาพรวมสถานีทั้งหมด</h2>
          <div className={`${panel} mt-5 grid grid-cols-3 divide-x divide-white/10`}>
            {(['critical', 'warning', 'normal'] as Key[]).map((k) => (
              <button key={k} onClick={() => { setFilter(k); document.getElementById('stations')?.scrollIntoView({ behavior: 'smooth' }); }} className="p-5 md:p-7 text-left hover:bg-white/[0.03] transition first:rounded-l-3xl last:rounded-r-3xl">
                <div className={`text-4xl md:text-5xl font-bold tabular-nums ${STATUS[k].text}`}>{counts[k]}</div>
                <div className="mt-2 text-sm text-[#9fb8bf]">สถานี{STATUS[k].label}</div>
              </button>
            ))}
          </div>
          {top && (
            <button onClick={() => pick(top)} className={`${panel} mt-3 w-full p-5 flex items-center justify-between gap-4 text-left hover:bg-[#10282f] transition`}>
              <div className="min-w-0">
                <div className="text-xs text-[#7f9ca4]">น้ำใกล้ตลิ่งที่สุด</div>
                <div className="font-medium truncate mt-1">{top.name}</div>
              </div>
              <div className={`text-3xl font-bold tabular-nums ${STATUS[statusOf(top.status)].text}`}>{top.capacityPercent}%</div>
            </button>
          )}
        </section>

        {/* Map */}
        <section id="map" className="py-8">
          <h2 className="text-2xl font-semibold">แผนที่สถานีวัดน้ำ</h2>
          <p className="text-sm text-[#7f9ca4] mt-1">แตะสถานีในตารางด้านล่างเพื่อเลื่อนแผนที่มาที่จุดนั้น</p>
          <div className="isolate relative mt-5 h-[60vh] min-h-[360px] rounded-3xl overflow-hidden ring-1 ring-white/10">
            <MapWrapper stations={list} selectedStation={selectedStation} />
          </div>
        </section>

        {/* Tide */}
        <section id="tide" className="py-8">
          <h2 className="text-2xl font-semibold flex items-center gap-2"><Waves className="size-5 text-[#4fd1c5]" /> น้ำทะเลหนุน</h2>
          <div className={`${panel} mt-5 p-5`}><TideChart tides={tides} /></div>
        </section>

        {/* All stations */}
        <section id="stations" className="py-8">
          <h2 className="text-2xl font-semibold">ทุกสถานี</h2>
          <div className="mt-5 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#7f9ca4]" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ค้นหาสถานีหรือชื่อคลอง"
                className="w-full bg-[#0d212a] rounded-xl py-3 pl-10 pr-4 text-sm placeholder:text-[#7f9ca4] outline-none ring-1 ring-white/10 focus:ring-[#4fd1c5]/60" />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="เรียงตาม"
              className="bg-[#0d212a] rounded-xl px-4 py-3 text-sm ring-1 ring-white/10 outline-none">
              <option value="capacity">เรียงตามความใกล้ตลิ่ง</option>
              <option value="level">เรียงตามระดับน้ำสูงสุด</option>
              <option value="name">เรียงตามชื่อ ก-ฮ</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto custom-scrollbar pb-1">
            {chips.map(([key, label, n]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm transition ${filter === key ? 'bg-[#4fd1c5] text-[#06242a] font-medium' : 'bg-white/5 text-[#9fb8bf] hover:bg-white/10'}`}>
                {label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>

          <div className={`${panel} mt-4 overflow-hidden`}>
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-4 px-5 py-3 text-xs text-[#7f9ca4] border-b border-white/10">
              <span>สถานี</span><span>ระดับน้ำ</span><span>ตลิ่ง</span><span>ความใกล้ตลิ่ง</span><span className="w-20 text-right">สถานะ</span>
            </div>
            {loading && !stations.length ? (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 m-3 rounded-xl bg-white/5 animate-pulse" />)
            ) : list.length === 0 ? (
              <p className="text-center text-[#7f9ca4] text-sm py-10">ไม่พบสถานีที่ตรงกับการค้นหา ลองล้างตัวกรองด้านบน</p>
            ) : (
              list.map((st) => {
                const k = statusOf(st.status);
                const pct = Number(st.capacityPercent) || 0;
                return (
                  <button key={st.id} onClick={() => pick(st)}
                    className="w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_2fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.04] transition">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{st.name}</div>
                      <div className="md:hidden text-xs text-[#7f9ca4] mt-1 tabular-nums">น้ำ {st.waterLevel} ม. · ตลิ่ง {st.bankHeight} ม.</div>
                    </div>
                    <div className="hidden md:block text-sm tabular-nums">{st.waterLevel} ม.</div>
                    <div className="hidden md:block text-sm tabular-nums text-[#9fb8bf]">{st.bankHeight} ม.</div>
                    <div className="hidden md:flex items-center gap-3">
                      <div className="flex-1"><Gauge pct={pct} k={k} /></div>
                      <span className={`w-10 text-right text-sm font-semibold tabular-nums ${STATUS[k].text}`}>{st.capacityPercent}%</span>
                    </div>
                    <div className="flex md:w-20 flex-col items-end gap-1.5">
                      <span className={`md:hidden text-base font-semibold tabular-nums ${STATUS[k].text}`}>{st.capacityPercent}%</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS[k].chip}`}>{STATUS[k].label}</span>
                    </div>
                    <div className="md:hidden col-span-2"><Gauge pct={pct} k={k} /></div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <footer className="pt-8 border-t border-white/10 text-xs text-[#7f9ca4] leading-relaxed">
          ข้อมูลระดับน้ำนำมาจัดแสดงใหม่ให้ดูง่ายขึ้น ไม่ใช่ประกาศทางการ ค่าที่วัดได้เป็นของจุดติดตั้งเท่านั้น พื้นที่ใกล้เคียงอาจสูงหรือต่ำกว่านี้
        </footer>
      </div>
    </main>
  );
}