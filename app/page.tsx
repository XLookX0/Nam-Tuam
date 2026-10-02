'use client';

import { useEffect, useState } from 'react';
import MapWrapper from '@/components/MapWrapper';
import TideChart from '@/components/TideChart';
import { Station } from '@/components/Map';
import { Droplets, AlertTriangle, Activity, Waves, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [tides, setTides] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
    const interval = setInterval(fetchData, 60000); // Auto refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      {/* Background Leaflet Map */}
      <div className="absolute inset-0 z-0">
        <MapWrapper stations={stations} selectedStation={selectedStation} />
      </div>

      {/* Floating Overlay Header */}
      <header className="absolute top-4 left-4 z-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-4 rounded-xl shadow-2xl max-w-sm w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="w-6 h-6 text-blue-500" />
            <h1 className="font-bold text-base tracking-wide">ระดับน้ำสมุทรสงคราม</h1>
          </div>
          <button
            onClick={fetchData}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          อัปเดตล่าสุด: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('th-TH') : 'กำลังโหลด...'}
        </p>
      </header>

      {/* Floating Right Sidebar (Desktop) / Bottom Sheet (Mobile) */}
      <aside className="absolute bottom-4 right-4 top-24 z-10 w-full max-w-md bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 shadow-2xl overflow-hidden">
        
        {/* Risk Status Summary */}
        <section className="flex gap-2">
          <div className="flex-1 bg-emerald-950/40 border border-emerald-900/50 p-2.5 rounded-lg text-center">
            <span className="text-xs text-emerald-400 block">ปกติ</span>
            <span className="text-lg font-bold text-emerald-200">
              {stations.filter((s) => s.status === 'normal').length}
            </span>
          </div>
          <div className="flex-1 bg-amber-950/40 border border-amber-900/50 p-2.5 rounded-lg text-center">
            <span className="text-xs text-amber-400 block">เฝ้าระวัง</span>
            <span className="text-lg font-bold text-amber-200">
              {stations.filter((s) => s.status === 'warning').length}
            </span>
          </div>
          <div className="flex-1 bg-red-950/40 border border-red-900/50 p-2.5 rounded-lg text-center">
            <span className="text-xs text-red-400 block">วิกฤต</span>
            <span className="text-lg font-bold text-red-200">
              {stations.filter((s) => s.status === 'critical').length}
            </span>
          </div>
        </section>

        {/* Stations List */}
        <section className="flex-1 overflow-y-auto pr-1 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-blue-400" /> สถานีตรวจวัด (เรียงตามระดับความเสี่ยง)
          </h2>
          {stations
            .slice()
            .sort((a, b) => Number(b.capacityPercent) - Number(a.capacityPercent))
            .map((st) => (
              <div
                key={st.id}
                onClick={() => setSelectedStation(st)}
                className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                  selectedStation?.id === st.id
                    ? 'bg-blue-950/40 border-blue-500'
                    : 'bg-zinc-800/40 border-zinc-800 hover:bg-zinc-800/80'
                }`}
              >
                <div>
                  <h3 className="font-medium text-sm text-zinc-200">{st.name}</h3>
                  <div className="text-xs text-zinc-400 mt-1">
                    ระดับน้ำ: <span className="text-zinc-200 font-semibold">{st.waterLevel} ม.</span> / ตลิ่ง {st.bankHeight} ม.
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
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
            ))}
        </section>

        {/* Tide Chart Section */}
        <section className="border-t border-zinc-800 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5 text-blue-400" /> คาดการณ์น้ำขึ้นน้ำลงวันนี้
          </h2>
          <TideChart tides={tides} />
        </section>
      </aside>
    </main>
  );
}