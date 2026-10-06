'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, LocateFixed, Search, Star } from 'lucide-react';
import { CamStatus, ageLabel, camHealth, frameUrl } from '@/lib/cameras';
import { Station, haversineKm } from '@/lib/station';
import { STATUS, card, kOf } from '@/lib/ui';

const shortName = (n: string) => n.replace(/\s*\(.*\)/, '').replace(/^สถานี(วัดน้ำ)?/, '').trim() || n;
const HEALTH_DOT = { ok: 'bg-emerald-400', late: 'bg-amber-400', off: 'bg-zinc-500' } as const;

export function CameraCard({ cam, station, saved, nowMs, distanceKm, onOpen }: {
  cam: CamStatus; station?: Station; saved: boolean; nowMs: number; distanceKm?: number; onOpen: (id: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const health = camHealth(cam.latestTs, nowMs);
  return (
    <button onClick={() => onOpen(cam.id)} className={`${card} group overflow-hidden text-left transition hover:bg-white/[0.07]`}>
      <div className="relative aspect-video bg-[#0a1c25]">
        {cam.latestTs && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frameUrl(cam.id, cam.latestTs)} alt={`ภาพล่าสุดจากกล้อง ${cam.name}`} loading="lazy" onError={() => setBroken(true)}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="grid h-full place-items-center text-zinc-500"><Camera className="size-8" /></div>
        )}
        <span className="glass absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
          <span className={`size-1.5 rounded-full ${HEALTH_DOT[health]}`} />
          {ageLabel(cam.latestTs, nowMs)}
        </span>
        {saved && <Star className="absolute right-2.5 top-2.5 size-5 fill-amber-300 text-amber-300 drop-shadow" />}
      </div>
      <div className="p-4">
        <div className="font-semibold leading-snug">{cam.name}</div>
        {cam.subtitle && <div className="mt-1 text-sm text-zinc-300">{cam.subtitle}</div>}
        {station && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-zinc-300">
            <span>ใกล้ {shortName(station.name)}</span>
            <b className={`tabular-nums ${STATUS[kOf(station)].text}`}>น้ำ {station.capacityPercent}%</b>
            {distanceKm != null && <span className="text-[#8fd3f4]">ห่าง {distanceKm.toFixed(1)} กม.</span>}
          </div>
        )}
        <div className="mt-2 text-[11px] text-zinc-500">ภาพ: {cam.credit}</div>
      </div>
    </button>
  );
}

export default function CamerasSection({ cameras, stations, userPos, onLocate, saved, onOpen }: {
  cameras: CamStatus[]; stations: Station[]; userPos: [number, number] | null; onLocate: () => void; saved: string[]; onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [near, setNear] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000); // keep the "N นาทีก่อน" badges fresh
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return cameras
      .filter((c) => !term || `${c.name} ${c.subtitle ?? ''}`.toLowerCase().includes(term))
      .map((c) => ({ c, km: near && userPos ? haversineKm(userPos, [c.lat, c.lng]) : undefined }))
      .sort((a, b) => {
        const sa = saved.includes(a.c.id) ? 0 : 1;
        const sb = saved.includes(b.c.id) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        if (a.km != null && b.km != null) return a.km - b.km;
        return a.c.name.localeCompare(b.c.name, 'th');
      });
  }, [cameras, q, near, userPos, saved]);

  const liveCount = cameras.filter((c) => camHealth(c.latestTs, nowMs) !== 'off').length;

  if (cameras.length === 0) {
    return <p className={`${card} p-8 text-center text-zinc-400`}>ยังไม่มีกล้องในระบบ</p>;
  }
  return (
    <div>
      <p className="text-zinc-300">ภาพนิ่งจากกล้อง {cameras.length} ตัว ({liveCount} ตัวส่งภาพอยู่) ดูสภาพจริงริมน้ำก่อนออกจากบ้าน แตะที่ภาพเพื่อดูย้อนหลังได้ถึง 3 วัน</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหากล้อง เช่น อัมพวา ประตูระบายน้ำ" aria-label="ค้นหากล้อง"
            className="w-full rounded-2xl bg-white/[0.06] py-3.5 pl-11 pr-4 text-sm outline-none ring-1 ring-white/10 placeholder:text-zinc-400 focus:ring-[#8fd3f4]/60" />
        </div>
        <button onClick={() => (userPos ? setNear((v) => !v) : (setNear(true), onLocate()))} aria-pressed={near && !!userPos}
          className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-medium ring-1 ring-white/10 transition ${near && userPos ? 'bg-[#8fd3f4] text-[#06242a]' : 'bg-white/[0.06] text-zinc-100 hover:bg-white/10'}`}>
          <LocateFixed className="size-4" /> กล้องใกล้ฉัน
        </button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ c, km }) => (
          <CameraCard key={c.id} cam={c} station={stations.find((s) => String(s.id) === String(c.stationId))} saved={saved.includes(c.id)} nowMs={nowMs} distanceKm={km} onOpen={onOpen} />
        ))}
      </div>
      {rows.length === 0 && <p className="py-10 text-center text-zinc-400">ไม่พบกล้องที่ตรงกับคำค้นหา</p>}
    </div>
  );
}