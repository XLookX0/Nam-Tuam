'use client';

import { useEffect, useState, useMemo } from 'react';
import MapWrapper from '@/components/MapWrapper';
import TideChart from '@/components/TideChart';
import { Station } from '@/components/Map';
import { Droplets, Search, Waves, RefreshCw, MapPin, ChevronUp, ChevronDown, Navigation } from 'lucide-react';

export default function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [tides, setTides] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Controls the mobile bottom sheet state
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

  const filteredStations = useMemo(() => {
    return stations
      .filter((st) => st.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => Number(b.capacityPercent) - Number(a.capacityPercent));
  }, [stations, searchQuery]);

  const criticalCount = stations.filter((s) => s.status === 'critical').length;
  const warningCount = stations.filter((s) => s.status === 'warning').length;

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      
      {/* 1. Background Map */}
      <div className="absolute inset-0 z-0">
        <MapWrapper stations={filteredStations} selectedStation={selectedStation} />
      </div>

      {/* 2. Top Header Island (Visible on Mobile, hidden inside sidebar on Desktop) */}
      <header className="md:hidden absolute top-4 left-4 right-4 z-10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-xl p-3.5 rounded-2xl border border-zinc-800/80 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 p-1.5 rounded-lg border border-blue-500/30">
            <Droplets className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-zinc-100">สมุทรสงคราม Flood</h1>
            <p className="text-[10px] text-zinc-400">อัปเดต: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('th-TH') : '...'}</p>
          </div>
        </div>
        <button onClick={fetchData} className="p-2 bg-zinc-800/50 rounded-full active:scale-95 transition-transform">
          <RefreshCw className={`w-4 h-4 text-zinc-300 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </header>

      {/* 3. The Interactive Panel (Desktop Sidebar / Mobile Bottom Sheet) */}
      <aside 
        className={`absolute z-20 flex flex-col transition-all duration-500 ease-in-out
          md:top-4 md:bottom-4 md:left-4 md:w-[380px] md:translate-y-0 md:rounded-3xl md:bg-zinc-900/85 md:border-zinc-800/80
          left-0 right-0 bottom-0 w-full rounded-t-3xl bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-2xl shadow-2xl
          ${isSheetOpen ? 'h-[85dvh] translate-y-0' : 'h-[80px] translate-y-0 md:h-auto'}
        `}
      >
        {/* Mobile Drag Handle & Mini-Summary (Only visible on mobile) */}
        <div 
          className="md:hidden w-full h-[80px] flex items-center justify-between px-6 cursor-pointer border-b border-zinc-800/50 shrink-0"
          onClick={() => setIsSheetOpen(!isSheetOpen)}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-sm font-medium text-zinc-300">วิกฤต: {criticalCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-sm font-medium text-zinc-300">เฝ้าระวัง: {warningCount}</span>
            </div>
          </div>
          <div className="p-2 bg-zinc-800/50 rounded-full">
            {isSheetOpen ? <ChevronDown className="w-5 h-5 text-zinc-400" /> : <ChevronUp className="w-5 h-5 text-zinc-400" />}
          </div>
        </div>

        {/* Content Wrapper (Fades out when mobile sheet is closed) */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${!isSheetOpen ? 'max-md:opacity-0 max-md:pointer-events-none' : 'opacity-100'}`}>
          
          {/* Desktop Only Header */}
          <div className="hidden md:flex items-center justify-between p-5 border-b border-zinc-800/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-xl border border-blue-500/30">
                <Droplets className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white">สมุทรสงคราม Flood</h1>
                <p className="text-[11px] text-zinc-400">อัปเดต: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('th-TH') : 'กำลังโหลด...'}</p>
              </div>
            </div>
            <button onClick={fetchData} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
              <RefreshCw className={`w-4 h-4 text-zinc-400 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>

          {/* Search & Stats */}
          <div className="p-5 space-y-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="ค้นหาสถานี..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>
          </div>

          {/* Station List */}
          <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-2 custom-scrollbar">
            {filteredStations.length === 0 ? (
              <div className="text-center text-zinc-500 text-sm mt-8">ไม่พบสถานีที่ค้นหา</div>
            ) : (
              filteredStations.map((st) => (
                <div
                  key={st.id}
                  onClick={() => {
                    setSelectedStation(st);
                    if (window.innerWidth < 768) setIsSheetOpen(false); // Auto-close sheet on mobile when station selected
                  }}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 flex items-center justify-between group ${
                    selectedStation?.id === st.id
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : 'bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${
                      st.status === 'critical' ? 'text-red-400' : 
                      st.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'
                    }`} />
                    <div>
                      <h3 className="font-medium text-sm text-zinc-200">{st.name}</h3>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        น้ำ: <span className="text-zinc-200 font-medium">{st.waterLevel}ม.</span> <span className="mx-1 text-zinc-700">|</span> ตลิ่ง: {st.bankHeight}ม.
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-bold shrink-0 ${
                    st.status === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 
                    st.status === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 
                    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {st.capacityPercent}%
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Tide Chart (Pinned to bottom of panel) */}
          <div className="p-5 border-t border-zinc-800/50 bg-zinc-900/30 shrink-0 md:rounded-b-3xl">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-2">
              <Waves className="w-3.5 h-3.5 text-blue-400" /> ระดับน้ำทะเล
            </h2>
            <TideChart tides={tides} />
          </div>

        </div>
      </aside>

      {/* Locate Me / Center Map Button (Floating above sheet) */}
      <button 
        className={`md:hidden absolute right-4 z-10 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 p-3 rounded-full shadow-xl transition-all duration-500 ${isSheetOpen ? 'bottom-[calc(85dvh+16px)]' : 'bottom-[96px]'}`}
        onClick={() => {
           // Small trick to force re-render/center map if needed
           if(selectedStation) setSelectedStation({...selectedStation});
        }}
      >
        <Navigation className="w-5 h-5 text-blue-400" />
      </button>

    </main>
  );
}