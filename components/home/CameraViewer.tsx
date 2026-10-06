'use client';

import { useEffect, useRef, useState } from 'react';
import { History, MapPin, Pause, Play, Share2, Star, X } from 'lucide-react';
import { CamStatus, CAM_MAX_DAYS, ageLabel, camHealth, fmtFrameTime, frameUrl } from '@/lib/cameras';

/** Photo viewer: scrub or play through up to 3 days of saved frames, compare an old frame with now, save, share, find on the map. */
export default function CameraViewer({ cam, saved, onSave, onShare, onViewMap, onClose }: {
  cam: CamStatus; saved: boolean; onSave: () => void; onShare: () => void; onViewMap: () => void; onClose: () => void;
}) {
  const [frames, setFrames] = useState<number[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [compare, setCompare] = useState(false);
  const [wipe, setWipe] = useState(50);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const closeRef = useRef<HTMLButtonElement>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetch(`/api/cameras/${cam.id}/frames`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const f: number[] = Array.isArray(j.frames) ? j.frames : [];
        setFrames(f);
        setIdx(Math.max(0, f.length - 1));
      })
      .catch(() => alive && setFrames([]));
    return () => {
      alive = false;
    };
  }, [cam.id]);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      document.body.style.overflow = prev;
      clearInterval(t);
    };
  }, []);

  const n = frames?.length ?? 0;
  const last = n - 1;
  const ts = frames && n ? frames[Math.min(idx, last)] : null;

  // timelapse: ~8 frames per second, stops at the newest frame; the next few frames are preloaded
  useEffect(() => {
    if (!playing || !frames) return;
    const t = setTimeout(() => {
      if (idx >= last) return setPlaying(false);
      setIdx(idx + 1);
    }, 125);
    return () => clearTimeout(t);
  }, [playing, idx, last, frames]);
  useEffect(() => {
    if (!frames) return;
    for (let k = 1; k <= 3; k++) {
      const f = frames[idx + k];
      if (f) new Image().src = frameUrl(cam.id, f);
    }
  }, [idx, frames, cam.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(last, i + 1));
      else if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onClose]);

  const newest = n ? frames![last] : cam.latestTs;
  const health = camHealth(newest ?? null, nowMs);
  const img = (t: number) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={frameUrl(cam.id, t)} alt="" onError={() => setFailed((f) => ({ ...f, [t]: true }))} draggable={false}
      className="absolute inset-0 h-full w-full select-none object-contain" />
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={`กล้อง ${cam.name}`} onClick={onClose}
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/75 backdrop-blur-sm md:items-center md:p-6">
      <div onClick={(e) => e.stopPropagation()}
        className="relative max-h-[100dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-[#0a1c25] p-4 ring-1 ring-white/10 md:rounded-3xl md:p-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-snug">{cam.name}</h3>
            {cam.subtitle && <p className="text-sm text-zinc-300">{cam.subtitle}</p>}
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="ปิด" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/5 hover:bg-white/10"><X className="size-5" /></button>
        </div>

        {/* picture */}
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
          {frames === null ? (
            <div className="grid h-full place-items-center text-sm text-zinc-400">กำลังโหลดภาพ...</div>
          ) : !ts ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-zinc-400">ยังไม่มีภาพจากกล้องนี้ กล้องจะเริ่มบันทึกภาพทุก 3 นาที</div>
          ) : failed[ts] ? (
            <div className="grid h-full place-items-center text-sm text-zinc-400">ภาพนี้ถูกลบหรือโหลดไม่ได้</div>
          ) : compare && newest ? (
            <>
              {img(newest)}
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}>{img(ts)}</div>
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,.6)]" style={{ left: `${wipe}%` }} />
              <input type="range" min={2} max={98} value={wipe} onChange={(e) => setWipe(Number(e.target.value))} aria-label="เลื่อนเปรียบเทียบ"
                className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
              <span className="glass absolute bottom-2.5 left-2.5 rounded-full px-3 py-1 text-xs font-semibold">{fmtFrameTime(ts)}</span>
              <span className="glass absolute bottom-2.5 right-2.5 rounded-full px-3 py-1 text-xs font-semibold">ตอนนี้</span>
            </>
          ) : (
            img(ts)
          )}
          {ts && !compare && <span className="glass absolute left-2.5 top-2.5 rounded-full px-3 py-1 text-xs font-semibold">{fmtFrameTime(ts)} น.</span>}
          <span className="glass pointer-events-none absolute bottom-2.5 right-2.5 rounded-full px-3 py-1 text-[11px] font-semibold text-zinc-200">น้ำสมุทรสงคราม</span>
        </div>

        {/* scrubber */}
        {n > 1 && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2 pr-4 ring-1 ring-white/10">
            <button onClick={() => { if (!playing && idx >= last) setIdx(0); setPlaying((p) => !p); }} aria-label={playing ? 'หยุดเล่น' : 'เล่นย้อนหลัง'}
              className="btn-primary grid size-11 shrink-0 place-items-center rounded-full active:scale-95">
              {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
            </button>
            <input type="range" className="replay-range min-w-0 flex-1" aria-label="เลื่อนดูภาพย้อนหลัง" min={0} max={last} step={1} value={Math.min(idx, last)}
              style={{ '--p': `${(Math.min(idx, last) / last) * 100}%` } as React.CSSProperties}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} />
            <div className="w-[88px] shrink-0 text-right text-sm font-semibold tabular-nums text-[#8fd3f4]">{ts ? fmtFrameTime(ts) : ''}</div>
          </div>
        )}
        {n > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-300">
            <span className="inline-flex items-center gap-1.5"><History className="size-3.5" /> ภาพย้อนหลัง {n} ภาพ ตั้งแต่ {fmtFrameTime(frames![0])} (สูงสุด {CAM_MAX_DAYS} วัน)</span>
            {n > 1 && (
              <button onClick={() => setCompare((v) => !v)} aria-pressed={compare}
                className={`rounded-full px-3.5 py-1.5 font-medium ring-1 transition ${compare ? 'bg-[#8fd3f4] text-[#06242a] ring-transparent' : 'text-[#8fd3f4] ring-[#8fd3f4]/50 hover:bg-[#8fd3f4]/10'}`}>
                เทียบก่อนกับตอนนี้
              </button>
            )}
          </div>
        )}

        {/* actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-sm">
          <button onClick={onSave} aria-pressed={saved} className={`flex items-center gap-1.5 font-medium ${saved ? 'text-amber-300' : 'text-[#8fd3f4]'}`}>
            <Star className={`size-4 ${saved ? 'fill-amber-300' : ''}`} /> {saved ? 'บันทึกแล้ว' : 'บันทึก'}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
            <span className={`size-1.5 rounded-full ${health === 'ok' ? 'bg-emerald-400' : health === 'late' ? 'bg-amber-400' : 'bg-zinc-500'}`} />
            ภาพล่าสุดถ่ายเมื่อ {ageLabel(newest ?? null, nowMs)}
          </span>
          <button onClick={onShare} className="flex items-center gap-1.5 font-medium text-[#8fd3f4]"><Share2 className="size-4" /> แชร์</button>
          <button onClick={onViewMap} className="flex items-center gap-1.5 font-medium text-[#8fd3f4]"><MapPin className="size-4" /> ดูบนแผนที่</button>
        </div>
        <div className="mt-3 text-[11px] text-zinc-500">ภาพ: {cam.credit}</div>
      </div>
    </div>
  );
}