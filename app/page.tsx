'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapWrapper from '@/components/MapWrapper';
import TideChart from '@/components/TideChart';
import { Station, ColorBy, isStale, haversineKm, fmtTime, fmtChange } from '@/lib/station';
import { Droplets, Search, Waves, RefreshCw, ArrowUp, ArrowDown, Minus, Share2, LocateFixed, X, TriangleAlert } from 'lucide-react';

type Filter = 'all' | 'rising' | 'falling' | 'warning' | 'critical' | 'stale';
type Sort = 'capacity' | 'change' | 'level' | 'name' | 'updated';

const STATUS = {
  critical: { label: 'วิกฤต', bar: 'bg-[#ff5d5d]', text: 'text-[#ff8a8a]', chip: 'bg-[#ff5d5d]/15 text-[#ff8a8a]' },
  warning: { label: 'เฝ้าระวัง', bar: 'bg-[#f5b544]', text: 'text-[#f7c970]', chip: 'bg-[#f5b544]/15 text-[#f7c970]' },
  normal: { label: 'ปกติ', bar: 'bg-[#3ecf8e]', text: 'text-[#6fe0ac]', chip: 'bg-[#3ecf8e]/15 text-[#6fe0ac]' },
  stale: { label: 'ไม่ส่งค่า', bar: 'bg-[#5b6e75]', text: 'text-[#8aa0a7]', chip: 'bg-white/10 text-[#9fb8bf]' },
} as const;
type Key = keyof typeof STATUS;
const kOf = (s: Station): Key => (isStale(s) ? 'stale' : s.status === 'critical' || s.status === 'warning' ? s.status : 'normal');

const TREND = {
  rising: { label: 'กำลังขึ้น', Icon: ArrowUp, text: 'text-[#ff8a6b]', bg: 'bg-[#ff7a59]' },
  falling: { label: 'กำลังลด', Icon: ArrowDown, text: 'text-[#4fd1c5]', bg: 'bg-[#4fd1c5]' },
  stable: { label: 'ทรงตัว', Icon: Minus, text: 'text-[#9fb8bf]', bg: 'bg-[#7f9ca4]' },
} as const;
const tOf = (s: Station) => TREND[s.trend] ?? TREND.stable;

const NAV: [string, string][] = [
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

function TrendLabel({ st, showChange = true }: { st: Station; showChange?: boolean }) {
  const t = tOf(st);
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${t.text}`}>
      <t.Icon className="size-3.5" />
      {t.label}
      {showChange && st.change6h != null && <span className="text-xs text-[#7f9ca4] tabular-nums">{fmtChange(st.change6h)}</span>}
    </span>
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
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('capacity');
  const [colorBy, setColorBy] = useState<ColorBy>('level');
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState('');
  const [active, setActive] = useState('');
  const pendingId = useRef<string | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    pendingId.current = new URLSearchParams(window.location.search).get('station');
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Open a shared station link once data has arrived
  useEffect(() => {
    if (!pendingId.current || !stations.length) return;
    const st = stations.find((s) => String(s.id) === pendingId.current);
    pendingId.current = null;
    if (st) {
      setSelectedId(st.id);
      setFocusKey((k) => k + 1);
      setTimeout(() => document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }, [stations]);

  // Highlight current section in the nav
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-40% 0px -55% 0px' }
    );
    NAV.forEach(([, h]) => {
      const el = document.getElementById(h.slice(1));
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const live = useMemo(() => stations.filter((s) => !isStale(s)), [stations]);
  const selectedStation = useMemo(() => stations.find((s) => s.id === selectedId) ?? null, [stations, selectedId]);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, normal: 0, stale: 0, rising: 0, falling: 0, stable: 0 };
    stations.forEach((s) => {
      const k = kOf(s);
      c[k]++;
      if (k !== 'stale') c[s.trend in c ? s.trend : 'stable']++;
    });
    return c;
  }, [stations]);

  const avg = live.length ? live.reduce((a, s) => a + (Number(s.capacityPercent) || 0), 0) / live.length : 0;
  const top = live.reduce<Station | null>((m, s) => (!m || Number(s.capacityPercent) > Number(m.capacityPercent) ? s : m), null);
  const overall: Exclude<Key, 'stale'> = counts.critical ? 'critical' : counts.warning ? 'warning' : 'normal';
  const headline = { critical: 'วิกฤตบางจุด', warning: 'ต้องเฝ้าระวัง', normal: 'ปกติ' }[overall];

  const movers = useMemo(() => {
    const hasDelta = live.some((s) => s.change6h != null);
    const d = (s: Station) => s.change6h ?? 0;
    const rising = live.filter((s) => s.trend === 'rising').sort((a, b) => (hasDelta ? d(b) - d(a) : Number(b.capacityPercent) - Number(a.capacityPercent))).slice(0, 5);
    const falling = live.filter((s) => s.trend === 'falling').sort((a, b) => (hasDelta ? d(a) - d(b) : Number(b.capacityPercent) - Number(a.capacityPercent))).slice(0, 5);
    return { rising, falling, hasDelta };
  }, [live]);

  const list = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stations
      .filter((st) => st.name.toLowerCase().includes(q))
      .filter((st) => {
        if (filter === 'all') return true;
        if (filter === 'stale') return isStale(st);
        if (isStale(st)) return false;
        return filter === 'rising' || filter === 'falling' ? st.trend === filter : st.status === filter;
      })
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name, 'th');
        if (sort === 'level') return Number(b.waterLevel) - Number(a.waterLevel);
        if (sort === 'updated') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (sort === 'change') return Math.abs(b.change6h ?? 0) - Math.abs(a.change6h ?? 0) || Number(b.capacityPercent) - Number(a.capacityPercent);
        return Number(b.capacityPercent) - Number(a.capacityPercent);
      });
  }, [stations, searchQuery, filter, sort]);

  const time = lastUpdated ? fmtTime(lastUpdated) : '...';
  const feedAgeMin = lastUpdated ? (Date.now() - new Date(lastUpdated).getTime()) / 60000 : 0;

  const pick = (st: Station) => {
    setSelectedId(st.id);
    setFocusKey((k) => k + 1);
    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' });
  };

  const goFilter = (f: Filter) => {
    setFilter(f);
    document.getElementById('stations')?.scrollIntoView({ behavior: 'smooth' });
  };

  const locate = () => {
    if (!navigator.geolocation) return say('เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง');
    say('กำลังหาตำแหน่งของคุณ...');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: [number, number] = [p.coords.latitude, p.coords.longitude];
        const ranked = live.map((s) => ({ s, km: haversineKm(pos, [s.lat, s.lng]) })).sort((a, b) => a.km - b.km)[0];
        if (!ranked || ranked.km > 30) return say('ตำแหน่งของคุณอยู่นอกพื้นที่สมุทรสงคราม');
        setUserPos(pos);
        pick(ranked.s);
        say(`สถานีใกล้คุณที่สุด อยู่ห่าง ${ranked.km.toFixed(1)} กม.`);
      },
      () => say('เปิดตำแหน่งไม่ได้ ลองอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์'),
      { timeout: 8000 }
    );
  };

  const share = async (st?: Station) => {
    const url = new URL(window.location.href);
    url.hash = '';
    if (st) url.searchParams.set('station', String(st.id));
    else url.searchParams.delete('station');
    const text = st ? `${st.name} น้ำ ${st.capacityPercent}% ของตลิ่ง` : `สมุทรสงครามตอนนี้น้ำ${headline}`;
    try {
      if (navigator.share) await navigator.share({ title: document.title, text, url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        say('คัดลอกลิงก์แล้ว');
      }
    } catch {
      /* user cancelled */
    }
  };

  const chips: [Filter, string, number][] = [
    ['all', 'ทั้งหมด', stations.length],
    ['rising', 'กำลังขึ้น', counts.rising],
    ['falling', 'กำลังลด', counts.falling],
    ['warning', 'เฝ้าระวัง', counts.warning],
    ['critical', 'วิกฤต', counts.critical],
    ['stale', 'ไม่ส่งค่า', counts.stale],
  ];

  const trendTotal = counts.rising + counts.falling + counts.stable || 1;

  return (
    <main className="min-h-screen bg-[#071219] text-[#e8f1ef]">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 bg-[#071219]/85 backdrop-blur-xl border-b border-white/10 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-6xl flex items-center gap-4 px-4 h-14">
          <a href="#top" className="flex items-center gap-2 font-semibold shrink-0">
            <span className="grid place-items-center size-8 rounded-lg bg-[#4fd1c5]/15 text-[#4fd1c5]"><Droplets className="size-4" /></span>
            <span className="hidden sm:inline">สมุทรสงคราม Flood</span>
          </a>
          <div className="flex gap-1 overflow-x-auto custom-scrollbar flex-1">
            {NAV.map(([l, h]) => (
              <a key={h} href={h} aria-current={active === h.slice(1) ? 'true' : undefined}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${active === h.slice(1) ? 'bg-white/10 text-white' : 'text-[#9fb8bf] hover:bg-white/10 hover:text-white'}`}>
                {l}
              </a>
            ))}
          </div>
          <button onClick={() => share()} aria-label="แชร์หน้านี้" className="grid place-items-center size-9 rounded-full bg-white/5 hover:bg-white/10 shrink-0">
            <Share2 className="size-4 text-[#9fb8bf]" />
          </button>
          <button onClick={fetchData} aria-label="รีเฟรชข้อมูล" className="grid place-items-center size-9 rounded-full bg-white/5 hover:bg-white/10 shrink-0">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin text-[#4fd1c5]' : 'text-[#9fb8bf]'}`} />
          </button>
        </div>
      </nav>

      {feedAgeMin > 30 && (
        <div className="bg-[#f5b544]/10 text-[#f7c970] text-sm">
          <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0" />
            ข้อมูลล่าสุดเมื่อ {time} น. แหล่งข้อมูลอาจล่าช้า ตัวเลขอาจไม่ตรงกับสถานการณ์ตอนนี้
          </div>
        </div>
      )}

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
              ดูว่าน้ำสูงใกล้ตลิ่งแค่ไหนในแต่ละสถานี กำลังขึ้นหรือลด และสถานีไหนต้องระวัง ข้อมูลรีเฟรชทุก 1 นาที
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={locate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4fd1c5] text-[#06242a] font-medium text-sm hover:brightness-110 transition">
                <LocateFixed className="size-4" /> สถานีใกล้ฉัน
              </button>
              <a href="#map" className="px-5 py-2.5 rounded-full bg-white/10 font-medium text-sm hover:bg-white/15 transition">เปิดแผนที่</a>
              <button onClick={() => share()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 font-medium text-sm hover:bg-white/15 transition">
                <Share2 className="size-4" /> แชร์
              </button>
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
            {([['critical', 'ถึงระดับวิกฤต'], ['warning', 'เกินระดับเฝ้าระวัง'], ['stale', 'ไม่ส่งค่าเกิน 3 ชม.']] as [Key, string][]).map(([k, label]) => (
              <button key={k} onClick={() => goFilter(k as Filter)} className="p-5 md:p-7 text-left hover:bg-white/[0.03] transition first:rounded-l-3xl last:rounded-r-3xl">
                <div className={`text-4xl md:text-5xl font-bold tabular-nums ${STATUS[k].text}`}>{counts[k]}</div>
                <div className="mt-2 text-sm text-[#9fb8bf]">{label}</div>
              </button>
            ))}
          </div>

          <div className={`${panel} mt-3 p-5`}>
            <div className="text-sm text-[#9fb8bf]">ทิศทางของน้ำ</div>
            <div className="mt-3 flex h-2.5 rounded-full overflow-hidden bg-white/10" role="img"
              aria-label={`กำลังขึ้น ${counts.rising} กำลังลด ${counts.falling} ทรงตัว ${counts.stable}`}>
              {(['rising', 'stable', 'falling'] as const).map((t) => (
                <div key={t} className={TREND[t].bg} style={{ width: `${(counts[t] / trendTotal) * 100}%` }} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(['rising', 'falling', 'stable'] as const).map((t) => {
                const T = TREND[t];
                const body = (
                  <>
                    <div className={`flex items-center gap-1 text-3xl font-bold tabular-nums ${T.text}`}><T.Icon className="size-5" />{counts[t]}</div>
                    <div className="text-xs text-[#9fb8bf] mt-1">{T.label}</div>
                  </>
                );
                return t === 'stable' ? <div key={t} className="p-2">{body}</div> : (
                  <button key={t} onClick={() => goFilter(t)} className="p-2 text-left rounded-xl hover:bg-white/5 transition">{body}</button>
                );
              })}
            </div>
          </div>

          {top && (
            <button onClick={() => pick(top)} className={`${panel} mt-3 w-full p-5 flex items-center justify-between gap-4 text-left hover:bg-[#10282f] transition`}>
              <div className="min-w-0">
                <div className="text-xs text-[#7f9ca4]">น้ำใกล้ตลิ่งที่สุด</div>
                <div className="font-medium truncate mt-1">{top.name}</div>
              </div>
              <div className={`text-3xl font-bold tabular-nums ${STATUS[kOf(top)].text}`}>{top.capacityPercent}%</div>
            </button>
          )}
        </section>

        {/* Map */}
        <section id="map" className="py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">แผนที่สถานีวัดน้ำ</h2>
              <p className="text-sm text-[#7f9ca4] mt-1">แตะจุดบนแผนที่ หรือแตะสถานีในตารางเพื่อดูรายละเอียด</p>
            </div>
            <div className="flex items-center gap-2">
              <div role="group" aria-label="สีของจุด" className="flex rounded-full bg-white/5 p-1 text-sm">
                {([['level', 'ตามระดับน้ำ'], ['trend', 'ตามทิศทาง']] as [ColorBy, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setColorBy(v)} aria-pressed={colorBy === v}
                    className={`px-3.5 py-1.5 rounded-full transition ${colorBy === v ? 'bg-[#4fd1c5] text-[#06242a] font-medium' : 'text-[#9fb8bf] hover:text-white'}`}>{l}</button>
                ))}
              </div>
              <button onClick={locate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-[#e8f1ef] transition">
                <LocateFixed className="size-4" /> ตำแหน่งของฉัน
              </button>
            </div>
          </div>

          <div className="isolate relative mt-5 h-[60vh] min-h-[360px] rounded-3xl overflow-hidden ring-1 ring-white/10">
            <MapWrapper stations={list} selectedStation={selectedStation} focusKey={focusKey} colorBy={colorBy} userPos={userPos} />
            <div className="absolute left-3 bottom-3 z-[500] rounded-xl bg-[#071219]/85 backdrop-blur px-3 py-2 text-xs text-[#cfe3e0] flex flex-wrap gap-x-3 gap-y-1 max-w-[calc(100%-1.5rem)]">
              {(colorBy === 'level'
                ? [['#3ecf8e', 'ปกติ'], ['#f5b544', 'เฝ้าระวัง'], ['#ff5d5d', 'วิกฤต']]
                : [['#ff7a59', 'กำลังขึ้น'], ['#4fd1c5', 'กำลังลด'], ['#7f9ca4', 'ทรงตัว']]
              ).map(([c, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c }} />{l}</span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-[#5b6e75]" />ไม่ส่งค่า</span>
            </div>
          </div>

          {selectedStation && (
            <div className={`${panel} mt-3 p-4 flex items-center gap-4`}>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{selectedStation.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#9fb8bf] tabular-nums">
                  <span>น้ำ {selectedStation.waterLevel} ม. / ตลิ่ง {selectedStation.bankHeight} ม.</span>
                  <TrendLabel st={selectedStation} />
                  <span>วัดเมื่อ {fmtTime(selectedStation.updatedAt)} น.</span>
                </div>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${STATUS[kOf(selectedStation)].text}`}>{selectedStation.capacityPercent}%</div>
              <button onClick={() => share(selectedStation)} aria-label="แชร์สถานีนี้" className="grid place-items-center size-9 rounded-full bg-white/5 hover:bg-white/10"><Share2 className="size-4" /></button>
              <button onClick={() => setSelectedId(null)} aria-label="ปิด" className="grid place-items-center size-9 rounded-full bg-white/5 hover:bg-white/10"><X className="size-4" /></button>
            </div>
          )}

          {(movers.rising.length > 0 || movers.falling.length > 0) && (
            <div className="mt-3 grid md:grid-cols-2 gap-3">
              {([['rising', 'ขึ้นเร็วที่สุด', movers.rising], ['falling', 'ลดเร็วที่สุด', movers.falling]] as const).map(([t, title, items]) => (
                <div key={t} className={`${panel} p-4`}>
                  <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${TREND[t].text}`}>
                    {(() => { const I = TREND[t].Icon; return <I className="size-4" />; })()}
                    {movers.hasDelta ? title : `${TREND[t].label} ใกล้ตลิ่งที่สุด`}
                  </h3>
                  {items.length === 0 ? <p className="mt-3 text-sm text-[#7f9ca4]">ไม่มีสถานีในกลุ่มนี้</p> : (
                    <ul className="mt-2">
                      {items.map((s) => (
                        <li key={s.id}>
                          <button onClick={() => pick(s)} className="w-full flex items-center justify-between gap-3 py-2 text-left text-sm hover:text-white text-[#cfe3e0]">
                            <span className="truncate">{s.name}</span>
                            <span className="tabular-nums shrink-0 text-[#9fb8bf]">{movers.hasDelta ? fmtChange(s.change6h) : `${s.capacityPercent}%`}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tide */}
        <section id="tide" className="py-8">
          <h2 className="text-2xl font-semibold flex items-center gap-2"><Waves className="size-5 text-[#4fd1c5]" /> น้ำทะเลหนุน</h2>
          <p className="text-sm text-[#7f9ca4] mt-1">คาดการณ์น้ำขึ้นน้ำลงของวันนี้ ช่วงน้ำขึ้นสูงมีผลต่อระดับน้ำในคลอง</p>
          <div className={`${panel} mt-5 p-5`}><TideChart tides={tides} /></div>
        </section>

        {/* All stations */}
        <section id="stations" className="py-8">
          <h2 className="text-2xl font-semibold">ทุกสถานี</h2>
          <div className="mt-5 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#7f9ca4]" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ค้นหาสถานีหรือชื่อคลอง" aria-label="ค้นหาสถานี"
                className="w-full bg-[#0d212a] rounded-xl py-3 pl-10 pr-4 text-sm placeholder:text-[#7f9ca4] outline-none ring-1 ring-white/10 focus:ring-[#4fd1c5]/60" />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="เรียงตาม"
              className="bg-[#0d212a] rounded-xl px-4 py-3 text-sm ring-1 ring-white/10 outline-none">
              <option value="capacity">เรียงตามความใกล้ตลิ่ง</option>
              <option value="change">เรียงตามเปลี่ยนแปลงมากสุด</option>
              <option value="level">เรียงตามระดับน้ำสูงสุด</option>
              <option value="updated">เรียงตามอัปเดตล่าสุด</option>
              <option value="name">เรียงตามชื่อ ก-ฮ</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto custom-scrollbar pb-1">
            {chips.map(([key, label, n]) => (
              <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm transition ${filter === key ? 'bg-[#4fd1c5] text-[#06242a] font-medium' : 'bg-white/5 text-[#9fb8bf] hover:bg-white/10'}`}>
                {label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>

          <div className={`${panel} mt-4 overflow-hidden`}>
            <div className="hidden md:grid grid-cols-[2fr_1fr_1.6fr_1.2fr_64px_84px] gap-4 px-5 py-3 text-xs text-[#7f9ca4] border-b border-white/10">
              <span>สถานี</span><span>ระดับน้ำ</span><span>ความใกล้ตลิ่ง</span><span>แนวโน้ม</span><span>วัดเมื่อ</span><span className="text-right">สถานะ</span>
            </div>
            {loading && !stations.length ? (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 m-3 rounded-xl bg-white/5 animate-pulse" />)
            ) : list.length === 0 ? (
              <p className="text-center text-[#7f9ca4] text-sm py-10">ไม่พบสถานีที่ตรงกับการค้นหา ลองล้างตัวกรองด้านบน</p>
            ) : (
              list.map((st) => {
                const k = kOf(st);
                const pct = Number(st.capacityPercent) || 0;
                return (
                  <button key={st.id} onClick={() => pick(st)}
                    className={`w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1.6fr_1.2fr_64px_84px] items-center gap-x-4 gap-y-2 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.04] transition ${selectedId === st.id ? 'bg-white/[0.05]' : ''}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{st.name}</div>
                      <div className="md:hidden text-xs text-[#7f9ca4] mt-1 tabular-nums flex flex-wrap items-center gap-x-2">
                        <span>น้ำ {st.waterLevel} ม. · ตลิ่ง {st.bankHeight} ม.</span>
                        <TrendLabel st={st} showChange={false} />
                      </div>
                    </div>
                    <div className="hidden md:block text-sm tabular-nums">
                      {st.waterLevel} ม.
                      <div className="text-xs text-[#7f9ca4]">ตลิ่ง {st.bankHeight} ม.</div>
                    </div>
                    <div className="hidden md:flex items-center gap-3">
                      <div className="flex-1"><Gauge pct={pct} k={k} /></div>
                      <span className={`w-10 text-right text-sm font-semibold tabular-nums ${STATUS[k].text}`}>{st.capacityPercent}%</span>
                    </div>
                    <div className="hidden md:block"><TrendLabel st={st} /></div>
                    <div className="hidden md:block text-xs text-[#9fb8bf] tabular-nums">{fmtTime(st.updatedAt)}</div>
                    <div className="flex md:justify-end flex-col md:flex-row items-end gap-1.5">
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
          ข้อมูลระดับน้ำและน้ำขึ้นน้ำลงจากหน่วยงานของรัฐ นำมาจัดแสดงใหม่ให้ดูง่ายขึ้น ไม่ใช่ประกาศทางการ ค่าที่วัดได้เป็นของจุดติดตั้งเท่านั้น พื้นที่ใกล้เคียงอาจสูงหรือต่ำกว่านี้
        </footer>
      </div>

      {toast && (
        <div role="status" className="fixed z-[2000] left-1/2 -translate-x-1/2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] rounded-full bg-[#e8f1ef] text-[#06242a] text-sm font-medium px-4 py-2 shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}