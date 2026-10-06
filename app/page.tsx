'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, LocateFixed, Search, Share2, TriangleAlert, TrendingUp, Waves, X } from 'lucide-react';
import TideChart from '@/components/TideChart';
import HeroScene from '@/components/home/HeroScene';
import SiteNav from '@/components/home/SiteNav';
import ReplayBar from '@/components/home/ReplayBar';
import MapStage from '@/components/home/MapStage';
import CamerasSection from '@/components/home/Cameras';
import CameraViewer from '@/components/home/CameraViewer';
import { TrendLabel } from '@/components/home/StationCard';
import { AreaId, Filter, HistoryChart, MyArea, Overview, SectionHead, Sort, StationsSection } from '@/components/home/Sections';
import { Snapshot, applySnapshot, recentTrend, sixHourChange } from '@/lib/history';
import { CAMERAS, CamStatus } from '@/lib/cameras';
import { Station, ColorBy, CameraMode, MapLayers, isStale, haversineKm, fmtTime, normalizeStation } from '@/lib/station';
import { STATUS, card, glass, kOf } from '@/lib/ui';

const shortName = (n: string) => n.replace(/\s*\(.*\)/, '').replace(/^สถานี(วัดน้ำ)?/, '').trim() || n;
const toMin = (t: string) => {
  const m = t.match(/(\d{1,2})[:.](\d{2})/);
  return m ? +m[1] * 60 + +m[2] : NaN;
};
const bangkokMinutes = () =>
  toMin(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(new Date()));

const DIR = {
  rising: { word: 'กำลังขึ้น', cls: 'text-orange-300 decoration-orange-300/80' },
  falling: { word: 'กำลังลด', cls: 'text-cyan-300 decoration-cyan-300/80' },
  stable: { word: 'ทรงตัว', cls: 'text-zinc-200 decoration-zinc-300/60' },
} as const;

export default function Dashboard() {
  const [rawStations, setStations] = useState<Station[]>([]);
  const [tides, setTides] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [heroQ, setHeroQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('capacity');
  const [area, setArea] = useState<AreaId>('mueang');
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState('');

  const [colorBy, setColorBy] = useState<ColorBy>('level');
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [fun, setFun] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [cam, setCam] = useState<{ mode: CameraMode | null; key: number }>({ mode: null, key: 0 });
  const [layers, setLayers] = useState<MapLayers>({ canals: true, roads: true, buildings: true });
  const pendingId = useRef<string | null>(null);
  const pendingCam = useRef<string | null>(null);

  // ---- cameras ----
  const [cameras, setCameras] = useState<CamStatus[]>(() => CAMERAS.map((c) => ({ ...c, latestTs: null, count: 0 })));
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [savedCams, setSavedCams] = useState<string[]>([]);
  const [showCameras, setShowCameras] = useState(true);
  const [camFocus, setCamFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);

  // ---- 24h history / replay ----
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [replay, setReplay] = useState<number | null>(null); // index into history; null = live
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/history');
        const j = await r.json();
        if (alive && Array.isArray(j.snapshots)) setHistory(j.snapshots);
      } catch {
        /* history is optional */
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/cameras');
        const j = await r.json();
        if (alive && Array.isArray(j.cameras)) setCameras(j.cameras);
      } catch {
        /* cameras are optional */
      }
    };
    load();
    const id = setInterval(() => !document.hidden && load(), 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    try {
      setSavedCams(JSON.parse(localStorage.getItem('nt:saved-cams') || '[]'));
    } catch {
      /* ignore */
    }
  }, []);
  const toggleSaved = (id: string) =>
    setSavedCams((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try {
        localStorage.setItem('nt:saved-cams', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  // Everything on the page reads `stations`, so replaying history needs no other changes.
  const stations = useMemo(() => {
    const n = history.length;
    if (replay != null && history[replay]) {
      const snap = history[replay];
      return rawStations.map((s) => {
        const a = applySnapshot(s, snap);
        a.change6h = sixHourChange(history, replay, String(s.id), a.waterLevel);
        a.trend = recentTrend(history, replay, String(s.id), a.waterLevel) ?? a.trend;
        return a;
      });
    }
    if (!n) return rawStations;
    return rawStations.map((s) => ({
      ...s,
      change6h: s.change6h ?? sixHourChange(history, n - 1, String(s.id), Number(s.waterLevel)),
      // live sources give a single reading, so work the direction out from the saved history
      trend: recentTrend(history, n - 1, String(s.id), Number(s.waterLevel)) ?? s.trend,
    }));
  }, [rawStations, history, replay]);
  const replaySnap = replay != null ? history[replay] ?? null : null;

  // Autoplay: step through the day, then drop back to live
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (replay == null) setReplay(0);
      else if (replay >= history.length - 1) {
        setPlaying(false);
        setReplay(null);
      } else setReplay(replay + 1);
    }, 700);
    return () => clearTimeout(t);
  }, [playing, replay, history.length]);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/water-data');
      if (!res.ok) throw new Error(`water-data responded ${res.status}`);
      const data = await res.json();
      setLoadError(false);
      setStations(((data.waterLevels || []) as Station[]).map(normalizeStation));
      setTides(data.tides || null);
      setLastUpdated(data.lastUpdated || '');
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    pendingId.current = sp.get('station');
    pendingCam.current = sp.get('camera');
    if (sp.get('view') === '3d') setViewMode('3d');
    // Weak devices: start without 3D buildings (the heaviest layer); they can switch it on from the map tools
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.deviceMemory != null && nav.deviceMemory <= 2) || (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 2)) {
      setLayers((l) => ({ ...l, buildings: false }));
    }
    fetchData();
    // Don't poll while the tab is hidden; refresh as soon as it's visible again
    const tick = () => {
      if (!document.hidden) fetchData();
    };
    const interval = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [fetchData]);

  // Keep ?view=3d in the address bar so shared links open in the same mode
  useEffect(() => {
    const u = new URL(window.location.href);
    if (viewMode === '3d') u.searchParams.set('view', '3d');
    else u.searchParams.delete('view');
    window.history.replaceState(null, '', u);
  }, [viewMode]);

  useEffect(() => {
    if (!pendingCam.current) return;
    const c = cameras.find((x) => x.id === pendingCam.current);
    if (c) {
      pendingCam.current = null;
      setViewerId(c.id);
    }
  }, [cameras]);
  useEffect(() => {
    if (pendingCam.current) return;
    const u = new URL(window.location.href);
    if (viewerId) u.searchParams.set('camera', viewerId);
    else u.searchParams.delete('camera');
    window.history.replaceState(null, '', u);
  }, [viewerId]);

  // Fullscreen map: lock page scroll, Esc closes
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const live = useMemo(() => stations.filter((s) => !isStale(s)), [stations]);
  const selectedStation = useMemo(() => stations.find((s) => s.id === selectedId) ?? null, [stations, selectedId]);

  // Open a shared station link once data has arrived
  useEffect(() => {
    if (!pendingId.current || !stations.length) return;
    const st = stations.find((s) => String(s.id) === pendingId.current);
    pendingId.current = null;
    if (st) {
      setSelectedId(st.id);
      setFocusKey((k) => k + 1);
      setTimeout(() => document.getElementById('map-stage')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    }
  }, [stations]);

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
  const overall: 'critical' | 'warning' | 'normal' = counts.critical ? 'critical' : counts.warning ? 'warning' : 'normal';
  const dir = counts.rising > counts.falling ? 'rising' : counts.falling > counts.rising ? 'falling' : 'stable';

  const movers = useMemo(() => {
    const hasDelta = live.some((s) => s.change6h != null);
    const d = (s: Station) => s.change6h ?? 0;
    const byCap = (a: Station, b: Station) => Number(b.capacityPercent) - Number(a.capacityPercent);
    const rising = live.filter((s) => s.trend === 'rising').sort((a, b) => (hasDelta ? d(b) - d(a) : byCap(a, b))).slice(0, 5);
    const falling = live.filter((s) => s.trend === 'falling').sort((a, b) => (hasDelta ? d(a) - d(b) : byCap(a, b))).slice(0, 5);
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

  const suggestions = useMemo(() => {
    const q = heroQ.trim().toLowerCase();
    return q ? stations.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5) : [];
  }, [stations, heroQ]);

  const time = replaySnap ? fmtTime(new Date(replaySnap.t).toISOString()) : lastUpdated ? fmtTime(lastUpdated) : '...';
  const feedAgeMin = replaySnap ? 0 : lastUpdated ? (Date.now() - new Date(lastUpdated).getTime()) / 60000 : 0;

  const peaks: { time: string; height: number }[] = tides?.peaks ?? [];
  const nowMin = bangkokMinutes();
  const nextPeak = peaks.find((p) => toMin(p.time) > nowMin);
  const nextHigh = peaks.length ? { ...(nextPeak ?? peaks[0]), tomorrow: !nextPeak } : null;

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: id === 'map-stage' ? 'center' : 'start' });

  // Choosing a station from anywhere on the page selects it and brings the map to it
  const select = (st: Station) => {
    setSelectedId(st.id);
    setFocusKey((k) => k + 1);
  };
  const pick = (st: Station) => {
    select(st);
    setHeroQ('');
    if (!fullscreen) scrollTo('map-stage');
  };
  const goFilter = (f: Filter) => {
    setFilter(f);
    scrollTo('stations');
  };

  const locate = (target: 'area' | 'map') => {
    if (!navigator.geolocation) return say('เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง');
    say('กำลังหาตำแหน่งของคุณ...');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: [number, number] = [p.coords.latitude, p.coords.longitude];
        const ranked = live.map((s) => ({ s, km: haversineKm(pos, [s.lat, s.lng]) })).sort((a, b) => a.km - b.km)[0];
        if (!ranked || ranked.km > 30) return say('ตำแหน่งของคุณอยู่นอกพื้นที่สมุทรสงคราม');
        setUserPos(pos);
        say(`สถานีใกล้คุณที่สุด อยู่ห่าง ${ranked.km.toFixed(1)} กม.`);
        if (target === 'map') select(ranked.s);
        else {
          setArea('near');
          scrollTo('my-area');
        }
      },
      () => say('เปิดตำแหน่งไม่ได้ ลองอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์'),
      { timeout: 8000 }
    );
  };
  const nearMe = () => {
    if (userPos) {
      setArea('near');
      scrollTo('my-area');
    } else locate('area');
  };

  const share = async (st?: Station) => {
    const url = new URL(window.location.href);
    url.hash = '';
    if (st) url.searchParams.set('station', String(st.id));
    else url.searchParams.delete('station');
    const text = st ? `${st.name} น้ำ ${st.capacityPercent}% ของตลิ่ง` : `สมุทรสงครามตอนนี้ น้ำ${DIR[dir].word}`;
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

  const shareCam = async (cam: CamStatus) => {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('station');
    url.searchParams.set('camera', cam.id);
    try {
      if (navigator.share) await navigator.share({ title: cam.name, text: `ภาพสดจากกล้อง ${cam.name}`, url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        say('คัดลอกลิงก์แล้ว');
      }
    } catch {
      /* user cancelled */
    }
  };
  const camOnMap = (cam: CamStatus) => {
    setViewerId(null);
    setShowCameras(true);
    setCamFocus((f) => ({ lat: cam.lat, lng: cam.lng, key: (f?.key ?? 0) + 1 }));
    if (!fullscreen) scrollTo('map-stage');
  };
  const viewerCam = cameras.find((c) => c.id === viewerId) ?? null;

  const open3D = () => {
    setViewMode('3d');
    setFullscreen(true);
  };

  const onScrub = (v: number) => {
    setPlaying(false);
    setReplay(v >= history.length - 1 ? null : v);
  };
  const onPlay = () => {
    if (playing) return setPlaying(false);
    if (replay == null || replay >= history.length - 1) setReplay(0);
    setPlaying(true);
  };
  const onLive = () => {
    setPlaying(false);
    setReplay(null);
  };

  const subtitle =
    live.length === 0
      ? loading
        ? 'กำลังโหลดข้อมูลล่าสุด...'
        : 'ยังไม่มีสถานีที่ส่งค่าในตอนนี้'
      : counts.critical || counts.warning
        ? `${counts.critical} จุดวัดถึงระดับวิกฤต และอีก ${counts.warning} จุดเกินระดับเฝ้าระวัง จากทั้งหมด ${live.length} จุดที่ส่งค่า`
        : `ทุกจุดวัดอยู่ในระดับปกติ จากทั้งหมด ${live.length} จุดที่ส่งค่า`;

  const selectedCard = selectedStation && (
    <div className={`${fullscreen ? glass : card} flex items-center gap-4 rounded-2xl p-4`}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{selectedStation.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs tabular-nums text-zinc-300">
          <span>น้ำ {selectedStation.waterLevel} / ตลิ่ง {selectedStation.bankHeight} ม.</span>
          <TrendLabel st={selectedStation} />
        </div>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${STATUS[kOf(selectedStation)].text}`}>{selectedStation.capacityPercent}%</div>
      <button onClick={() => share(selectedStation)} aria-label="แชร์สถานีนี้" className="grid size-10 place-items-center rounded-xl bg-white/5 hover:bg-white/10"><Share2 className="size-4" /></button>
      <button onClick={() => setSelectedId(null)} aria-label="ปิด" className="grid size-10 place-items-center rounded-xl bg-white/5 hover:bg-white/10"><X className="size-4" /></button>
    </div>
  );

  const chip = 'inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-sm text-zinc-100 ring-1 ring-white/10';

  return (
    <main id="top" className="site">
      {!fullscreen && <SiteNav onNear={nearMe} onOpen3D={open3D} onShare={() => share()} />}

      {/* ------------------------------ Hero ------------------------------ */}
      <header className="relative overflow-hidden pb-6 pt-28 md:pt-36">
        <div className="hero-glow" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[1.02fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`${glass} inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full px-4 py-2 text-sm`}>
                <span className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${replaySnap ? 'bg-sky-300' : feedAgeMin > 30 ? 'bg-amber-400' : 'animate-pulse bg-emerald-400'}`} />
                  {replaySnap ? 'ย้อนดูข้อมูล ณ' : 'ข้อมูลสด ล่าสุด'} <b className="font-semibold">{time} น.</b>
                </span>
                <span className="text-zinc-400">{live.length}/{stations.length} จุดส่งค่า</span>
              </div>
              {loadError && (
                <button onClick={fetchData} className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3.5 py-2 text-sm text-red-300">
                  <TriangleAlert className="size-4" /> โหลดข้อมูลไม่สำเร็จ ลองใหม่
                </button>
              )}
              {!loadError && feedAgeMin > 30 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3.5 py-2 text-sm text-amber-200">
                  <TriangleAlert className="size-4" /> ข้อมูลอาจล่าช้า
                </span>
              )}
            </div>

            <h1 className="mt-6 text-5xl font-bold leading-[1.12] tracking-tight md:text-6xl xl:text-7xl">
              สมุทรสงคราม
              <br />
              {replaySnap ? 'ตอนนั้น' : 'ตอนนี้'} น้ำ
              <span className={`wavy whitespace-nowrap ${DIR[dir].cls}`}>{DIR[dir].word}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-200 md:text-xl">{subtitle}</p>

            <div className="relative mt-7 max-w-xl">
              <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-[#8fd3f4]" />
              <input value={heroQ} onChange={(e) => setHeroQ(e.target.value)} aria-label="ค้นหาสถานีหรือคลอง"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && heroQ.trim()) {
                    setSearchQuery(heroQ.trim());
                    setFilter('all');
                    scrollTo('stations');
                  }
                }}
                placeholder="ค้นหาคลอง แม่น้ำ หรือสถานี"
                className="glass w-full rounded-full py-4 pl-14 pr-5 text-base outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-[#8fd3f4]/50" />
              {suggestions.length > 0 && (
                <ul className="glass absolute inset-x-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl p-1.5 shadow-2xl shadow-black/50">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button onClick={() => pick(s)} className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm hover:bg-white/10">
                        <span className="truncate">{s.name}</span>
                        <span className={`shrink-0 font-semibold tabular-nums ${STATUS[kOf(s)].text}`}>{s.capacityPercent}%</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
              <button onClick={() => scrollTo('map')} className="btn-primary flex items-center gap-3 rounded-full py-3.5 pl-6 pr-3 text-base">
                เปิดแผนที่จุดวัด
                <span className="grid size-9 place-items-center rounded-full bg-black/10"><ArrowDownRight className="size-5" /></span>
              </button>
              <button onClick={nearMe} className="flex items-center gap-2 border-b border-white/30 pb-0.5 text-base font-medium hover:border-white">
                <LocateFixed className="size-4" /> ค้นหาคลองใกล้บ้าน
              </button>
              <button onClick={() => share()} className="flex items-center gap-2 border-b border-white/30 pb-0.5 text-base font-medium hover:border-white">
                <Share2 className="size-4" /> แชร์
              </button>
            </div>

            <div className="mt-8 flex flex-wrap gap-2.5">
              <span className={chip}><TrendingUp className="size-4 text-orange-300" /> น้ำกำลังขึ้น {counts.rising} จุด ลด {counts.falling} จุด</span>
              {top && (
                <button onClick={() => pick(top)} className={`${chip} transition hover:bg-white/10`}>
                  สูงสุดตอนนี้ {shortName(top.name)} <b className={`tabular-nums ${STATUS[kOf(top)].text}`}>{top.capacityPercent}%</b>
                </button>
              )}
              {nextHigh && (
                <button onClick={() => scrollTo('tide')} className={`${chip} transition hover:bg-white/10`}>
                  <Waves className="size-4 text-[#8fd3f4]" /> น้ำทะเลหนุนสูงสุด{nextHigh.tomorrow ? 'พรุ่งนี้' : 'ถัดไป'} {nextHigh.time} น. ({nextHigh.height} ม.)
                </button>
              )}
            </div>
          </div>

          <div className="lg:-mr-20">
            <HeroScene pct={avg} status={overall} label={`${avg.toFixed(0)}% ของตลิ่ง`} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-24 px-4 pb-44 pt-14 md:space-y-32 md:px-6 md:pt-20">
        <section id="my-area">
          <SectionHead eyebrow="ย่านของฉัน" title="น้ำใกล้บ้านเป็นอย่างไร" desc="เลือกอำเภอ หรือให้เราหาสถานีวัดน้ำที่ใกล้ตำแหน่งของคุณที่สุด" />
          <MyArea stations={stations} area={area} onArea={setArea} userPos={userPos} onLocate={() => locate('area')}
            history={history} replay={replay} selectedId={selectedId} onPick={pick} />
        </section>

        <section id="overview">
          <SectionHead eyebrow="ภาพรวม" title="สถานการณ์ทั้งจังหวัด" desc="สรุปทุกสถานีในพริบตา กดตัวเลขเพื่อดูรายชื่อสถานีนั้น" />
          <Overview counts={counts} avg={avg} top={top} movers={movers} onFilter={goFilter} onPick={pick} />
        </section>

        <section id="cameras">
          <SectionHead eyebrow="กล้อง CCTV" title="กล้องริมน้ำ" />
          <CamerasSection cameras={cameras} stations={stations} userPos={userPos} onLocate={() => locate('area')} saved={savedCams} onOpen={setViewerId} />
        </section>

        <section id="map">
          <SectionHead eyebrow="แผนที่" title="แผนที่จุดวัดน้ำ" desc="แตะจุดเพื่อดูรายละเอียด สลับเป็นมุมมอง 3 มิติ หรือกดเต็มจอเพื่อสำรวจ" />
          <div id="map-stage" className="h-[68vh] min-h-[420px]">
            <MapStage
              stations={list} selectedStation={selectedStation} focusKey={focusKey} userPos={userPos}
              colorBy={colorBy} onColorBy={setColorBy} viewMode={viewMode} onViewMode={setViewMode}
              fun={fun} onFun={setFun} cam={cam} onCam={setCam} layers={layers} onLayers={setLayers}
              fullscreen={fullscreen} onFullscreen={setFullscreen}
              onSelect={select}
              onUnsupported={() => {
                setViewMode('2d');
                say('เปิดแผนที่ 3 มิติไม่ได้ในอุปกรณ์นี้ จึงกลับไปแบบ 2 มิติ');
              }}
              onLocate={() => locate('map')} onShare={() => share()} onRefresh={fetchData} loading={loading}
              cameras={cameras} showCameras={showCameras} onShowCameras={setShowCameras} onCameraOpen={setViewerId} focus={camFocus}
            >
              {selectedCard}
            </MapStage>
          </div>
          {!fullscreen && selectedCard && <div className="mt-4">{selectedCard}</div>}
        </section>

        <section id="history">
          <SectionHead eyebrow="ย้อนหลัง" title="ระดับน้ำ 24 ชั่วโมงที่ผ่านมา" desc="เลือกสถานีเพื่อดูกราฟ หรือเลื่อนแถบด้านล่างเพื่อย้อนดูทั้งหน้าเว็บ ณ เวลานั้น" />
          <HistoryChart stations={stations} history={history} replay={replay} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} />
        </section>

        <section id="tide">
          <SectionHead eyebrow="น้ำขึ้นลง" title="น้ำทะเลหนุน" desc="คาดการณ์น้ำขึ้นน้ำลงของวันนี้ ช่วงน้ำขึ้นสูงมีผลต่อระดับน้ำในคลอง" />
          <div className={`${card} p-5 md:p-6`}><TideChart tides={tides} /></div>
        </section>

        <section id="stations">
          <SectionHead eyebrow="ทุกจุดวัด" title="รายชื่อสถานีวัดน้ำ" desc="ค้นหา กรอง และเรียงลำดับสถานีทั้งหมด" />
          <StationsSection list={list} counts={counts} total={stations.length} filter={filter} onFilter={setFilter} sort={sort} onSort={setSort}
            search={searchQuery} onSearch={setSearchQuery} loading={loading} history={history} replay={replay} selectedId={selectedId} onPick={pick} />
        </section>

        <footer className="border-t border-white/10 pt-8 text-xs leading-relaxed text-zinc-400">
          ข้อมูลระดับน้ำและน้ำขึ้นน้ำลงจากหน่วยงานของรัฐ นำมาจัดแสดงใหม่ให้ดูง่ายขึ้น ไม่ใช่ประกาศทางการ ค่าที่วัดได้เป็นของจุดติดตั้งเท่านั้น พื้นที่ใกล้เคียงอาจสูงหรือต่ำกว่านี้
          <br />
          แผนที่ &copy; OpenStreetMap contributors, OpenFreeMap
        </footer>
      </div>

      {viewerCam && (
        <CameraViewer key={viewerCam.id} cam={viewerCam} saved={savedCams.includes(viewerCam.id)} onSave={() => toggleSaved(viewerCam.id)}
          onShare={() => shareCam(viewerCam)} onViewMap={() => camOnMap(viewerCam)} onClose={() => setViewerId(null)} />
      )}

      <ReplayBar history={history} replay={replay} playing={playing} snapT={replaySnap?.t ?? null} onLive={onLive} onScrub={onScrub} onPlay={onPlay} />

      {toast && (
        <div role="status" className="toast rounded-full">{toast}</div>
      )}
    </main>
  );
}