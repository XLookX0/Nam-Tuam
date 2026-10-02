'use client';

import { useEffect, useState, useMemo } from 'react';
import MapWrapper from '@/components/MapWrapper';
import TideChart from '@/components/TideChart';
import { Station } from '@/components/Map';
import { Droplets, Search, Waves, RefreshCw, ChevronUp, ChevronDown, Navigation } from 'lucide-react';

type Filter = 'all' | 'critical' | 'warning' | 'normal';

const STATUS = {
  critical: { label: 'วิกฤต', bar: 'bg-[#ff5d5d]', text: 'text-[#ff8a8a]', chip: 'bg-[#ff5d5d]/15 text-[#ff8a8a]' },
  warning: { label: 'เฝ้าระวัง', bar: 'bg-[#f5b544]', text: 'text-[#f7c970]', chip: 'bg-[#f5b544]/15 text-[#f7c970]' },
  normal: { label: 'ปกติ', bar: 'bg-[#3ecf8e]', text: 'text-[#6fe0ac]', chip: 'bg-[#3ecf8e]/15 text-[#6fe0ac]' },
} as const;

const statusOf = (s: string) => (s === 'critical' || s === 'warning' ? s : 'normal') as keyof typeof STATUS;

export default function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [tides, setTides] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [isSheetOpen, setIsSheetOpen] = useState(false);

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

  const filteredStations = useMemo(() => {
    return stations
      .filter((st) => st.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((st) => filter === 'all' || statusOf(st.status) === filter)
      .sort((a, b) => Number(b.capacityPercent) - Number(a.capacityPercent));
  }, [stations, searchQuery, filter]);

  const time = lastUpdated ? new Date(lastUpdated).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '...';

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="grid place-items-center size-10 rounded-xl bg-[#4fd1c5]/15 text-[#4fd1c5] shrink-0">
          <Droplets className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-base leading-tight text-[#e8f1ef] truncate">ระดับน้ำสมุทรสงคราม</h1>
          <p className="text-xs text-[#7f9ca4] mt-0.5 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#3ecf8e] animate-pulse" />
            อัปเดตล่าสุด {time} น.
          </p>
        </div>
      </div>
      <button
        onClick={fetchData}
        aria-label="รีเฟรชข้อมูล"
        className="grid place-items-center size-9 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition"
      >
        <RefreshCw className={`size-4 text-[#9fb8bf] ${loading ? 'animate-spin text-[#4fd1c5]' : ''}`} />
      </button>
    </div>
  );

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'ทั้งหมด', n: stations.length },
    { key: 'critical', label: 'วิกฤต', n: counts.critical },
    { key: 'warning', label: 'เฝ้าระวัง', n: counts.warning },
    { key: 'normal', label: 'ปกติ', n: counts.normal },
  ];

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-[#0a1a20] text-[#e8f1ef]">
      {/* Map */}
      <div className="absolute inset-0 z-0">
        <MapWrapper stations={filteredStations} selectedStation={selectedStation} />
      </div>

      {/* Mobile header */}
      <header className="md:hidden absolute top-3 left-3 right-3 z-10 bg-[#0c1f26]/90 backdrop-blur-xl p-3 rounded-2xl ring-1 ring-white/10 shadow-xl">
        {header}
      </header>

      {/* Panel: desktop sidebar / mobile bottom sheet */}
      <aside
        className={`absolute z-20 flex flex-col bg-[#0c1f26]/90 backdrop-blur-2xl ring-1 ring-white/10 shadow-2xl transition-[height] duration-500 ease-in-out
          md:top-4 md:bottom-4 md:left-4 md:w-[400px] md:h-auto md:rounded-3xl
          left-0 right-0 bottom-0 w-full rounded-t-3xl
          ${isSheetOpen ? 'h-[85dvh]' : 'h-[76px]'}`}
      >
        {/* Mobile peek bar */}
        <button
          className="md:hidden w-full h-[76px] flex items-center justify-between px-5 shrink-0"
          onClick={() => setIsSheetOpen(!isSheetOpen)}
          aria-expanded={isSheetOpen}
        >
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#ff5d5d] animate-pulse" />วิกฤต {counts.critical}</span>
            <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#f5b544]" />เฝ้าระวัง {counts.warning}</span>
            <span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#3ecf8e]" />ปกติ {counts.normal}</span>
          </div>
          {isSheetOpen ? <ChevronDown className="size-5 text-[#7f9ca4]" /> : <ChevronUp className="size-5 text-[#7f9ca4]" />}
        </button>

        <div className={`flex-1 flex flex-col min-h-0 transition-opacity duration-300 ${!isSheetOpen ? 'max-md:opacity-0 max-md:pointer-events-none' : ''}`}>
          <div className="hidden md:block p-5 pb-4 shrink-0">{header}</div>

          {/* Summary bar: share of stations by status */}
          <div className="px-5 pb-4 shrink-0">
            <div className="flex h-2 rounded-full overflow-hidden bg-white/5 gap-0.5">
              {(['critical', 'warning', 'normal'] as const).map(
                (k) => counts[k] > 0 && <div key={k} className={STATUS[k].bar} style={{ flex: counts[k] }} />
              )}
            </div>
            <div className="flex gap-2 mt-3 overflow-x-auto custom-scrollbar pb-1">
              {chips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    filter === c.key ? 'bg-[#4fd1c5] text-[#06242a]' : 'bg-white/5 text-[#9fb8bf] hover:bg-white/10'
                  }`}
                >
                  {c.label} <span className="tabular-nums opacity-70">{c.n}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="px-5 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#7f9ca4]" />
              <input
                type="text"
                placeholder="ค้นหาสถานี"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm placeholder:text-[#7f9ca4] outline-none ring-1 ring-transparent focus:ring-[#4fd1c5]/60 transition"
              />
            </div>
          </div>

          {/* Station list */}
          <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2 custom-scrollbar">
            {loading && stations.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[76px] rounded-2xl bg-white/5 animate-pulse" />)
            ) : filteredStations.length === 0 ? (
              <p className="text-center text-[#7f9ca4] text-sm mt-8">ไม่พบสถานีที่ตรงกับการค้นหา</p>
            ) : (
              filteredStations.map((st) => {
                const k = statusOf(st.status);
                const pct = Number(st.capacityPercent) || 0;
                const selected = selectedStation?.id === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => {
                      setSelectedStation(st);
                      if (window.innerWidth < 768) setIsSheetOpen(false);
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl transition ${
                      selected ? 'bg-[#4fd1c5]/10 ring-1 ring-[#4fd1c5]/50' : 'bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm truncate">{st.name}</h3>
                        <p className="text-xs text-[#7f9ca4] mt-1 tabular-nums">
                          น้ำ <span className="text-[#e8f1ef] font-medium">{st.waterLevel} ม.</span>
                          <span className="mx-1.5 opacity-40">จาก</span>ตลิ่ง {st.bankHeight} ม.
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-semibold leading-none tabular-nums ${STATUS[k].text}`}>{st.capacityPercent}%</div>
                        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium ${STATUS[k].chip}`}>{STATUS[k].label}</span>
                      </div>
                    </div>
                    {/* Bank-fill gauge: full bar = water at the top of the bank */}
                    <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full ${STATUS[k].bar} transition-[width] duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Tide */}
          <div className="p-5 border-t border-white/10 shrink-0 md:rounded-b-3xl">
            <h2 className="text-xs font-medium text-[#9fb8bf] flex items-center gap-1.5 mb-2">
              <Waves className="size-3.5 text-[#4fd1c5]" /> ระดับน้ำทะเลหนุน
            </h2>
            <TideChart tides={tides} />
          </div>
        </div>
      </aside>

      {/* Re-center button (mobile) */}
      <button
        aria-label="เลื่อนแผนที่ไปยังสถานีที่เลือก"
        className={`md:hidden absolute right-3 z-10 bg-[#0c1f26]/90 backdrop-blur-xl ring-1 ring-white/10 p-3 rounded-full shadow-xl transition-all duration-500 ${isSheetOpen ? 'bottom-[calc(85dvh+12px)]' : 'bottom-[88px]'}`}
        onClick={() => selectedStation && setSelectedStation({ ...selectedStation })}
      >
        <Navigation className="size-5 text-[#4fd1c5]" />
      </button>
    </main>
  );
}