'use client';

import { useEffect, useState, useMemo } from 'react';
import MapWrapper from '@/components/MapWrapper';
import TideChart from '@/components/TideChart';
import { Station } from '@/components/Map';
import { Droplets, Search, Activity, Waves, RefreshCw, MapPin } from 'lucide-react';

export default function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [tides, setTides] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState(''); // State สำหรับช่องค้นหา

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/water-data');
      const data = await res.json();
      setStations(data.waterLevels || []);
      setTides(data.tides || null);
      setLastUpdated(data.lastUpdated || '');
    } catch (err) {
      console.error('Failed to load dashboard water data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // ระบบค้นหาและเรียงลำดับความเสี่ยง
  const filteredStations = useMemo(() => {
    return stations
      .filter((st) => st.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => Number(b.capacityPercent) - Number(a.capacityPercent));
  }, [stations, searchQuery]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      
      {/* 1. แผนที่พื้นหลัง (เต็มจอ) */}
      <div className="absolute inset-0 z-0">
        <MapWrapper stations={filteredStations} selectedStation={selectedStation} />
      </div>

      {/* 2. แผงควบคุม (Sidebar บน Desktop / Bottom Sheet บน Mobile) */}
      <aside className="absolute bottom-0 md:bottom-auto md:top-4 md:left-4 z-10 w-full md:w-[400px] h-[65vh] md:h-[calc(100vh-32px)] bg-zinc-900/85 backdrop-blur-xl md:border border-t border-zinc-800/80 md:rounded-2xl flex flex-col shadow-2xl transition-all duration-300">
        
        {/* ส่วนหัว และ กล่องค้นหา */}
        <div className="p-4 border-b border-zinc-800/50 space-y-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-xl border border-blue-500/30 shadow-inner">
                <Droplets className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight text-white">สมุทรสงคราม Flood</h1>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                  อัปเดต: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('th-TH') : 'กำลังโหลด...'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>

          {/* ช่องค้นหาอัจฉริยะแบบ pop.in.th */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="ค้นหาชื่อคลอง หรือ สถานีวัดน้ำ..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/50 border border-zinc-700/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
            />
          </div>

          {/* สรุปสถานะความเสี่ยง (Stat Chips) */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-2 text-center">
              <span className="text-[11px] text-zinc-500 block mb-0.5">ทั้งหมด</span>
              <span className="text-base font-bold text-zinc-300">{stations.length}</span>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 text-center">
              <span className="text-[11px] text-amber-500/80 block mb-0.5">เฝ้าระวัง</span>
              <span className="text-base font-bold text-amber-400">{stations.filter(s => s.status === 'warning').length}</span>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2 text-center shadow-[0_0_15px_rgba(239,68,68,0.1)]">
              <span className="text-[11px] text-red-500/80 block mb-0.5">วิกฤต</span>
              <span className="text-base font-bold text-red-400">{stations.filter(s => s.status === 'critical').length}</span>
            </div>
          </div>
        </div>

        {/* รายการสถานีวัดน้ำ (เลื่อน Scroll ได้) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {filteredStations.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm mt-4">ไม่พบสถานีที่ค้นหา</div>
          ) : (
            filteredStations.map((st) => (
              <div
                key={st.id}
                onClick={() => setSelectedStation(st)}
                className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between group ${
                  selectedStation?.id === st.id
                    ? 'bg-blue-500/10 border-blue-500/50 shadow-sm'
                    : 'bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-800/60 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <MapPin className={`w-4 h-4 mt-0.5 ${
                    st.status === 'critical' ? 'text-red-400' : 
                    st.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'
                  }`} />
                  <div>
                    <h3 className="font-medium text-sm text-zinc-200 group-hover:text-white transition-colors">{st.name}</h3>
                    <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                      ระดับน้ำ: <span className="text-zinc-200 font-semibold">{st.waterLevel} ม.</span>
                      <span className="text-zinc-600">|</span>
                      ตลิ่ง: {st.bankHeight} ม.
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold tracking-wide ${
                      st.status === 'critical'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : st.status === 'warning'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {st.capacityPercent}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* กราฟน้ำขึ้นน้ำลง (ติดอยู่ด้านล่างเสมอ) */}
        <div className="p-4 border-t border-zinc-800/50 bg-zinc-950/30 md:rounded-b-2xl shrink-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-1">
            <Waves className="w-3.5 h-3.5 text-blue-400" /> คาดการณ์น้ำขึ้นน้ำลงวันนี้
          </h2>
          <TideChart tides={tides} />
        </div>
      </aside>
    </main>
  );
}