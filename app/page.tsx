'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapWrapper from '@/components/MapWrapper';
import TideChart from '@/components/TideChart';
import { funIconSvg } from '@/lib/funIcons';
import { Station, ColorBy, CameraMode, MapLayers, isStale, haversineKm, fmtTime, fmtChange } from '@/lib/station';
import { Droplets, Search, Waves, Sailboat, PanelLeftClose, PanelLeftOpen, Building, Building2, Compass, Route, Map as MapIcon, RefreshCw, ArrowUp, ArrowDown, Minus, Share2, LocateFixed, X, TriangleAlert } from 'lucide-react';

type Filter = 'all' | 'rising' | 'falling' | 'warning' | 'critical' | 'stale';
type Sort = 'capacity' | 'change' | 'level' | 'name' | 'updated';
type Tab = 'stations' | 'overview' | 'tide';
type Snap = 'peek' | 'half' | 'full';

const STATUS = {
  critical: { label: 'วิกฤต', bar: 'bg-red-500', text: 'text-red-400', chip: 'bg-red-500/15 text-red-300' },
  warning: { label: 'เฝ้าระวัง', bar: 'bg-amber-400', text: 'text-amber-300', chip: 'bg-amber-400/15 text-amber-200' },
  normal: { label: 'ปกติ', bar: 'bg-emerald-400', text: 'text-emerald-300', chip: 'bg-emerald-400/15 text-emerald-200' },
  stale: { label: 'ไม่ส่งค่า', bar: 'bg-zinc-500', text: 'text-zinc-300', chip: 'bg-white/10 text-zinc-300' },
} as const;
type Key = keyof typeof STATUS;
const kOf = (s: Station): Key => (isStale(s) ? 'stale' : s.status === 'critical' || s.status === 'warning' ? s.status : 'normal');

const TREND = {
  rising: { label: 'กำลังขึ้น', Icon: ArrowUp, text: 'text-orange-400', bg: 'bg-orange-400' },
  falling: { label: 'กำลังลด', Icon: ArrowDown, text: 'text-cyan-300', bg: 'bg-cyan-300' },
  stable: { label: 'ทรงตัว', Icon: Minus, text: 'text-zinc-300', bg: 'bg-zinc-400' },
} as const;
const tOf = (s: Station) => TREND[s.trend] ?? TREND.stable;

// Glass surfaces
const glass = 'glass';
const sub = 'rounded-2xl bg-white/[0.04] ring-1 ring-white/10';
const iconBtn = 'grid place-items-center size-9 rounded-xl text-zinc-300 hover:bg-white/10 active:bg-white/15 transition shrink-0';

// Sheet geometry lives in globals.css (.panel[data-snap]).
const SNAPS: Snap[] = ['peek', 'half', 'full'];

const SUMMARY: Record<'all' | 'warning' | 'critical', { text: string; on: string }> = {
  all: { text: 'text-cyan-300', on: 'bg-cyan-400/10 ring-cyan-400/50' },
  warning: { text: 'text-amber-300', on: 'bg-amber-400/10 ring-amber-400/50' },
  critical: { text: 'text-red-400', on: 'bg-red-500/10 ring-red-500/50' },
};

function Gauge({ pct, k }: { pct: number; k: Key }) {
  return (
    <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full ${STATUS[k].bar} transition-[width] duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
      {/* thresholds: 70% watch, 90% critical */}
      <span className="absolute inset-y-0 left-[70%] w-px bg-white/30" />
      <span className="absolute inset-y-0 left-[90%] w-px bg-white/30" />
    </div>
  );
}

function TrendLabel({ st, showChange = true }: { st: Station; showChange?: boolean }) {
  const t = tOf(st);
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${t.text}`}>
      <t.Icon className="size-3" />
      {t.label}
      {showChange && st.change6h != null && <span className="text-zinc-300 tabular-nums">{fmtChange(st.change6h)}</span>}
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
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [fun, setFun] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [cam, setCam] = useState<{ mode: CameraMode | null; key: number }>({ mode: null, key: 0 });
  const [layers, setLayers] = useState<MapLayers>({ canals: true, roads: true, buildings: true });
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState<Tab>('stations');
  const [sheet, setSheet] = useState<Snap>('peek');
  const pendingId = useRef<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef({ y0: 0, y: 0, t: 0, v: 0 });

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
    }
  }, [stations]);

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

  const expand = () => setSheet((s) => (s === 'peek' ? 'half' : s));

  // Selecting a station drops the sheet so the map and popup are visible
  const pick = (st: Station) => {
    setSelectedId(st.id);
    setFocusKey((k) => k + 1);
    setSheet('peek');
  };

  const goFilter = (f: Filter) => {
    setFilter(f);
    setTab('stations');
    expand();
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

  // Sheet handle: the sheet follows the finger, then snaps to the nearest position (velocity-aware). A tap cycles.
  const visibleFor = (snap: Snap) => {
    const H = window.innerHeight;
    return snap === 'peek' ? 216 : snap === 'half' ? H * 0.55 : H * 0.9;
  };
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    gesture.current = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(0);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag == null) return;
    const g = gesture.current;
    const now = performance.now();
    g.v = (e.clientY - g.y) / Math.max(now - g.t, 1); // px per ms, + is downward
    g.y = e.clientY;
    g.t = now;
    const here = visibleFor(sheet);
    const lo = -(visibleFor('full') - here); // can't pull past fully open
    const hi = here - visibleFor('peek'); // can't push past resting
    setDrag(Math.min(hi, Math.max(lo, e.clientY - g.y0)));
  };
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag == null) return;
    const dy = e.clientY - gesture.current.y0;
    const v = gesture.current.v;
    setDrag(null);
    if (Math.abs(dy) < 8) {
      setSheet(SNAPS[(SNAPS.indexOf(sheet) + 1) % 3]);
      return;
    }
    const projected = visibleFor(sheet) - dy - v * 180;
    const nearest = SNAPS.reduce((a, b) => (Math.abs(visibleFor(b) - projected) < Math.abs(visibleFor(a) - projected) ? b : a));
    setSheet(nearest);
  };

  const summary: ['all' | 'warning' | 'critical', string, number][] = [
    ['all', 'ทั้งหมด', stations.length],
    ['warning', 'เฝ้าระวัง', counts.warning],
    ['critical', 'วิกฤต', counts.critical],
  ];
  const pills: [Filter, string, number][] = [
    ['rising', 'กำลังขึ้น', counts.rising],
    ['falling', 'กำลังลด', counts.falling],
    ['stale', 'ไม่ส่งค่า', counts.stale],
  ];
  const tabs: [Tab, string][] = [['stations', 'สถานี'], ['overview', 'ภาพรวม'], ['tide', 'น้ำขึ้นน้ำลง']];
  const trendTotal = counts.rising + counts.falling + counts.stable || 1;

  return (
    <main className="app text-zinc-100" data-panel={panelOpen ? 'open' : 'closed'}>
      {/* Map: always in the background. Between md and lg it starts right of the sidebar so stations aren't centred underneath it. */}
      <div className="map-layer">
        <MapWrapper
          mode={viewMode}
          stations={list}
          selectedStation={selectedStation}
          focusKey={focusKey}
          colorBy={colorBy}
          userPos={userPos}
          onSelect={pick}
          camera={cam}
          fun={fun}
          layers={layers}
          onCameraEnd={() => setCam((c) => ({ ...c, mode: null }))}
          onUnsupported={() => {
            setViewMode('2d');
            say('เปิดแผนที่ 3 มิติไม่ได้ในอุปกรณ์นี้ จึงกลับไปแบบ 2 มิติ');
          }}
        />
      </div>

      {/* Floating header */}
      <div className="hud">
        <header className={`${glass} pointer-events-auto flex items-center gap-1.5 h-12 pl-3 pr-1.5 rounded-2xl w-full md:w-auto shadow-lg shadow-black/30`}>
          <div className="flex items-center gap-2 min-w-0 flex-1 md:hidden">
            <span className="grid place-items-center size-7 rounded-lg bg-cyan-400/15 text-cyan-300"><Droplets className="size-4" /></span>
            <span className="font-semibold text-sm truncate">สมุทรสงคราม</span>
          </div>
          <span className="hidden md:flex items-center gap-2 pr-2 text-xs text-zinc-300">
            <span className={`size-2 rounded-full ${feedAgeMin > 30 ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
            อัปเดต {time} น.
          </span>
          <span className="md:hidden flex items-center gap-1.5 text-xs text-zinc-300 pr-1">
            <span className={`size-1.5 rounded-full ${feedAgeMin > 30 ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
            {time} น.
          </span>
          <button onClick={locate} aria-label="ตำแหน่งของฉัน" className={iconBtn}><LocateFixed className="size-4" /></button>
          <button onClick={() => share()} aria-label="แชร์หน้านี้" className={iconBtn}><Share2 className="size-4" /></button>
          <button onClick={fetchData} aria-label="รีเฟรชข้อมูล" className={iconBtn}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin text-cyan-300' : ''}`} />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
          <div role="group" aria-label="โหมดแผนที่" className={`${glass} pointer-events-auto flex rounded-xl p-0.5 text-xs`}>
            {(['2d', '3d'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)} aria-pressed={viewMode === m}
                className={`px-3 py-1.5 rounded-[10px] font-medium transition ${viewMode === m ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-300 hover:text-white'}`}>
                {m === '2d' ? '2 มิติ' : '3 มิติ'}
              </button>
            ))}
          </div>
          <div role="group" aria-label="สีของจุด" className={`${glass} pointer-events-auto flex rounded-xl p-0.5 text-xs`}>
            {([['level', 'ตามระดับน้ำ'], ['trend', 'ตามทิศทาง']] as [ColorBy, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setColorBy(v)} aria-pressed={colorBy === v}
                className={`px-3 py-1.5 rounded-[10px] transition ${colorBy === v ? 'bg-cyan-400 text-zinc-950 font-medium' : 'text-zinc-300 hover:text-white'}`}>{l}</button>
            ))}
          </div>
          <div className={`${glass} hidden xl:flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-zinc-300`}>
            {(colorBy === 'level'
              ? [['#3ecf8e', 'ปกติ'], ['#f5b544', 'เฝ้าระวัง'], ['#ff5d5d', 'วิกฤต']]
              : [['#ff7a59', 'ขึ้น'], ['#4fd1c5', 'ลด'], ['#7f9ca4', 'ทรงตัว']]
            ).map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border-2 border-zinc-500" />ไม่ส่งค่า</span>
            {viewMode === '3d' && <span className="hidden 2xl:inline text-zinc-300">แท่ง = น้ำ หลอดใส = ตลิ่ง</span>}
          </div>
        </div>
      </div>

      {/* Reopen the sidebar after hiding it (tablet / desktop) */}
      {!panelOpen && (
        <button onClick={() => setPanelOpen(true)} aria-label="แสดงแผงด้านข้าง" title="แสดงแผง"
          className={`${glass} hidden md:grid absolute z-30 left-4 top-4 place-items-center size-12 rounded-2xl text-zinc-200 hover:bg-white/10 transition`}>
          <PanelLeftOpen className="size-5" />
        </button>
      )}

      {/* 3D controls: camera presets and basemap layers */}
      {viewMode === '3d' && (
        <div className="absolute z-30 right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-none">
          <div className={`${glass} pointer-events-auto flex flex-col gap-1 p-1 rounded-2xl`}>
            {([
              ['city', 'มุมเมือง', Building2],
              ['top', 'มองจากบน', MapIcon],
              ['tour', 'สำรวจจุดวัด', Compass],
            ] as [CameraMode, string, typeof Building2][]).map(([m, label, Icon]) => (
              <button key={m} title={label} aria-label={label} aria-pressed={cam.mode === m}
                onClick={() => { setCam((c) => ({ mode: m, key: c.key + 1 })); if (m === 'tour') setSheet('peek'); }}
                className={`grid place-items-center size-10 rounded-xl transition ${cam.mode === m ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-300 hover:bg-white/10'}`}>
                <Icon className="size-[18px]" />
              </button>
            ))}
          </div>
          <div className={`${glass} pointer-events-auto flex flex-col gap-1 p-1 rounded-2xl`}>
            {([
              ['canals', 'คลอง', Waves],
              ['roads', 'ถนน', Route],
              ['buildings', 'ตึก', Building],
            ] as [keyof MapLayers, string, typeof Waves][]).map(([k, label, Icon]) => (
              <button key={k} title={label} aria-label={label} aria-pressed={layers[k]}
                onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                className={`grid place-items-center size-10 rounded-xl transition ${layers[k] ? 'text-cyan-300 bg-cyan-400/15' : 'text-zinc-400 hover:bg-white/10'}`}>
                <Icon className="size-[18px]" />
              </button>
            ))}
          </div>
          <div className={`${glass} pointer-events-auto p-1 rounded-2xl`}>
            <button title="โหมดสนุก" aria-label="โหมดสนุก" aria-pressed={fun} onClick={() => setFun((f) => !f)}
              className={`grid place-items-center size-10 rounded-xl transition ${fun ? 'bg-amber-400 text-zinc-950' : 'text-zinc-300 hover:bg-white/10'}`}>
              <Sailboat className="size-[18px]" />
            </button>
          </div>
        </div>
      )}

      {viewMode === '3d' && fun && (
        <div className={`${glass} hidden md:flex absolute z-30 right-16 bottom-9 items-center gap-4 rounded-2xl px-4 py-2 text-xs text-zinc-200`}>
          {([['duck', 'ปกติ'], ['boat', 'เฝ้าระวัง'], ['sub', 'วิกฤต']] as const).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="block w-8 h-6 shrink-0" dangerouslySetInnerHTML={{ __html: funIconSvg(k) }} />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Sidebar (md+) / bottom sheet (mobile) */}
      <aside
        aria-label="ข้อมูลระดับน้ำ"
        data-snap={sheet}
        data-dragging={drag != null}
        style={{ '--drag': `${drag ?? 0}px` } as React.CSSProperties}
        className="panel glass"
      >
        {/* Handle (mobile) */}
        <div role="button" tabIndex={0} aria-label="ขยายหรือย่อแผง" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSheet(SNAPS[(SNAPS.indexOf(sheet) + 1) % 3])}
          className="md:hidden touch-none shrink-0 grid place-items-center h-9 cursor-grab">
          <span className="h-1 w-10 rounded-full bg-white/25" />
        </div>

        {/* Summary block, visible when peeking */}
        <div className="shrink-0 px-4 md:px-5 pb-3 md:pt-5">
          <div className="hidden md:flex items-center gap-2.5 mb-4">
            <span className="grid place-items-center size-9 rounded-xl bg-cyan-400/15 text-cyan-300"><Droplets className="size-5" /></span>
            <div className="leading-tight">
              <div className="font-semibold">สมุทรสงคราม Flood</div>
              <div className="text-xs text-zinc-300">ระดับน้ำแบบเรียลไทม์ {stations.length} สถานี</div>
            </div>
            <button onClick={() => setPanelOpen(false)} aria-label="ซ่อนแผงด้านข้าง" title="ซ่อนแผง" className={`${iconBtn} ml-auto`}>
              <PanelLeftClose className="size-4" />
            </button>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold leading-snug">
            ตอนนี้น้ำ <span className={STATUS[overall].text}>{loading && !stations.length ? '...' : headline}</span>
          </h1>
          {feedAgeMin > 30 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-300">
              <TriangleAlert className="size-3.5 shrink-0" /> ข้อมูลล่าสุดเมื่อ {time} น. แหล่งข้อมูลอาจล่าช้า
            </p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {summary.map(([k, label, n]) => {
              const on = filter === k;
              const glow = k === 'critical' && n > 0 ? 'shadow-[0_0_28px_-4px_rgba(255,93,93,0.55)]' : '';
              return (
                <button key={k} onClick={() => goFilter(k)} aria-pressed={on}
                  className={`rounded-2xl px-3 py-2.5 text-left ring-1 transition ${glow} ${on ? SUMMARY[k].on : 'bg-white/[0.03] ring-white/10 hover:bg-white/[0.07]'}`}>
                  <div className={`text-2xl font-semibold tabular-nums leading-none ${SUMMARY[k].text}`}>{n}</div>
                  <div className="mt-1.5 text-xs text-zinc-300">{label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div role="tablist" className="shrink-0 px-4 md:px-5 pb-2 flex gap-1 border-b border-white/10">
          {tabs.map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); expand(); }}
              className={`flex-1 py-2 rounded-xl text-sm transition ${tab === t ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:text-white'}`}>{l}</button>
          ))}
        </div>

        {/* Scrollable body */}
        <div data-snap={sheet} className="panel-body custom-scrollbar px-4 md:px-5">
          {tab === 'stations' && (
            <div className="pt-3 space-y-3">
              {selectedStation && (
                <div className="rounded-2xl bg-cyan-400/10 ring-1 ring-cyan-400/30 p-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{selectedStation.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-zinc-300 tabular-nums">
                      <span>น้ำ {selectedStation.waterLevel} / ตลิ่ง {selectedStation.bankHeight} ม.</span>
                      <TrendLabel st={selectedStation} />
                    </div>
                  </div>
                  <button onClick={() => share(selectedStation)} aria-label="แชร์สถานีนี้" className={iconBtn}><Share2 className="size-4" /></button>
                  <button onClick={() => setSelectedId(null)} aria-label="ปิด" className={iconBtn}><X className="size-4" /></button>
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setSheet('full')}
                    placeholder="ค้นหาสถานีหรือชื่อคลอง" aria-label="ค้นหาสถานี"
                    className="w-full rounded-xl bg-white/[0.06] py-2.5 pl-9 pr-3 text-sm placeholder:text-zinc-400 outline-none ring-1 ring-white/10 focus:ring-cyan-400/60" />
                </div>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="เรียงตาม"
                  className="w-28 rounded-xl bg-zinc-900/80 px-2.5 py-2.5 text-xs text-zinc-200 ring-1 ring-white/10 outline-none">
                  <option value="capacity">ใกล้ตลิ่ง</option>
                  <option value="change">เปลี่ยนมากสุด</option>
                  <option value="level">ระดับสูงสุด</option>
                  <option value="updated">อัปเดตล่าสุด</option>
                  <option value="name">ชื่อ ก-ฮ</option>
                </select>
              </div>

              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 -mx-1 px-1">
                {pills.map(([key, label, n]) => (
                  <button key={key} onClick={() => setFilter(filter === key ? 'all' : key)} aria-pressed={filter === key}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs transition ${filter === key ? 'bg-cyan-400 text-zinc-950 font-medium' : 'bg-white/[0.06] text-zinc-300 hover:bg-white/10'}`}>
                    {label} <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                ))}
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="shrink-0 px-3 py-1 rounded-full text-xs text-zinc-300 hover:text-white">ล้างตัวกรอง</button>
                )}
              </div>

              <div className="space-y-2">
                {loading && !stations.length ? (
                  Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[88px] rounded-2xl bg-white/5 animate-pulse" />)
                ) : list.length === 0 ? (
                  <p className="text-center text-zinc-400 text-sm py-10">ไม่พบสถานีที่ตรงกับการค้นหา ลองล้างตัวกรอง</p>
                ) : (
                  list.map((st) => {
                    const k = kOf(st);
                    const pct = Number(st.capacityPercent) || 0;
                    const glow = k === 'critical' ? 'shadow-[0_0_24px_-8px_rgba(255,93,93,0.7)]' : '';
                    return (
                      <button key={st.id} onClick={() => pick(st)}
                        className={`w-full text-left rounded-2xl p-3.5 ring-1 transition active:scale-[0.99] ${glow} ${
                          selectedId === st.id ? 'bg-white/10 ring-cyan-400/50' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.08]'
                        }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{st.name}</div>
                            <div className="mt-1 flex items-center gap-2.5">
                              <TrendLabel st={st} />
                              <span className="text-[11px] text-zinc-400 tabular-nums">{fmtTime(st.updatedAt)} น.</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-xl font-semibold tabular-nums leading-none ${STATUS[k].text}`}>{st.capacityPercent}%</div>
                            <span className={`mt-1.5 inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium ${STATUS[k].chip}`}>{STATUS[k].label}</span>
                          </div>
                        </div>
                        <div className="mt-3"><Gauge pct={pct} k={k} /></div>
                        <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400 tabular-nums">
                          <span>น้ำ {st.waterLevel} ม.</span>
                          <span>ตลิ่ง {st.bankHeight} ม.</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'overview' && (
            <div className="pt-3 space-y-3">
              <div className={`${sub} p-4`}>
                <CanalGauge pct={avg} k={overall} />
                <p className="mt-2 text-sm text-zinc-300">
                  ระดับน้ำเฉลี่ยทุกสถานี <span className="text-white font-semibold tabular-nums">{avg.toFixed(0)}%</span> ของความสูงตลิ่ง
                </p>
              </div>

              <div className={`${sub} p-4`}>
                <div className="text-sm text-zinc-300">ทิศทางของน้ำ</div>
                <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-white/10" role="img"
                  aria-label={`กำลังขึ้น ${counts.rising} กำลังลด ${counts.falling} ทรงตัว ${counts.stable}`}>
                  {(['rising', 'stable', 'falling'] as const).map((t) => (
                    <div key={t} className={TREND[t].bg} style={{ width: `${(counts[t] / trendTotal) * 100}%` }} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1">
                  {(['rising', 'falling', 'stable'] as const).map((t) => {
                    const T = TREND[t];
                    const body = (
                      <>
                        <div className={`flex items-center gap-1 text-2xl font-semibold tabular-nums ${T.text}`}><T.Icon className="size-4" />{counts[t]}</div>
                        <div className="text-xs text-zinc-300 mt-0.5">{T.label}</div>
                      </>
                    );
                    return t === 'stable' ? <div key={t} className="p-2">{body}</div> : (
                      <button key={t} onClick={() => goFilter(t)} className="p-2 text-left rounded-xl hover:bg-white/5 transition">{body}</button>
                    );
                  })}
                </div>
              </div>

              <button onClick={() => goFilter('stale')} className={`${sub} w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.07] transition`}>
                <span className="text-sm text-zinc-300">ไม่ส่งค่าเกิน 3 ชั่วโมง</span>
                <span className="text-2xl font-semibold tabular-nums text-zinc-300">{counts.stale}</span>
              </button>

              {top && (
                <button onClick={() => pick(top)} className={`${sub} w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.07] transition`}>
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-300">น้ำใกล้ตลิ่งที่สุด</div>
                    <div className="text-sm font-medium truncate mt-1">{top.name}</div>
                  </div>
                  <div className={`text-2xl font-semibold tabular-nums ${STATUS[kOf(top)].text}`}>{top.capacityPercent}%</div>
                </button>
              )}

              {([['rising', 'ขึ้นเร็วที่สุด', movers.rising], ['falling', 'ลดเร็วที่สุด', movers.falling]] as const)
                .filter(([, , items]) => items.length > 0)
                .map(([t, title, items]) => {
                  const I = TREND[t].Icon;
                  return (
                    <div key={t} className={`${sub} p-4`}>
                      <h3 className={`flex items-center gap-1.5 text-sm font-medium ${TREND[t].text}`}>
                        <I className="size-4" />
                        {movers.hasDelta ? title : `${TREND[t].label} ใกล้ตลิ่งที่สุด`}
                      </h3>
                      <ul className="mt-1.5">
                        {items.map((s) => (
                          <li key={s.id}>
                            <button onClick={() => pick(s)} className="w-full flex items-center justify-between gap-3 py-2 text-left text-sm text-zinc-200 hover:text-white">
                              <span className="truncate">{s.name}</span>
                              <span className="tabular-nums shrink-0 text-zinc-300">{movers.hasDelta ? fmtChange(s.change6h) : `${s.capacityPercent}%`}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

              <p className="text-[11px] leading-relaxed text-zinc-400 pt-1">
                ข้อมูลจากหน่วยงานของรัฐ นำมาจัดแสดงใหม่ให้ดูง่ายขึ้น ไม่ใช่ประกาศทางการ ค่าที่วัดได้เป็นของจุดติดตั้งเท่านั้น พื้นที่ใกล้เคียงอาจสูงหรือต่ำกว่านี้ แผนที่ &copy; CARTO &copy; OpenFreeMap &copy; OpenStreetMap
              </p>
            </div>
          )}

          {tab === 'tide' && (
            <div className="pt-3">
              <h2 className="flex items-center gap-2 text-base font-medium"><Waves className="size-4 text-cyan-300" /> น้ำทะเลหนุน</h2>
              <p className="text-xs text-zinc-300 mt-1 mb-3">คาดการณ์น้ำขึ้นน้ำลงของวันนี้ ช่วงน้ำขึ้นสูงมีผลต่อระดับน้ำในคลอง</p>
              <div className={`${sub} p-4`}><TideChart tides={tides} /></div>
            </div>
          )}
        </div>
      </aside>

      {toast && (
        <div role="status" className="absolute z-40 left-1/2 -translate-x-1/2 top-32 rounded-full bg-zinc-100 text-zinc-900 text-sm font-medium px-4 py-2 shadow-xl max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </main>
  );
}