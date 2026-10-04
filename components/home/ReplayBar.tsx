'use client';

import { History, Pause, Play } from 'lucide-react';

/** 24-hour history slider, fixed to the bottom of the screen on every device; it replays the whole page. */
export default function ReplayBar({
  history, replay, playing, snapT, onLive, onScrub, onPlay,
}: {
  history: { t: number }[];
  replay: number | null;
  playing: boolean;
  snapT: number | null;
  onLive: () => void;
  onScrub: (v: number) => void;
  onPlay: () => void;
}) {
  const n = history.length;
  const wrap = 'fixed z-[70] inset-x-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[min(760px,calc(100vw-2rem))]';
  const bottom = { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' } as const;

  if (n < 2) {
    return (
      <div className={wrap} style={bottom}>
        <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-xs text-zinc-300">
          <History className="size-4 text-zinc-400" /> ย้อนหลัง 24 ชม. กำลังเก็บข้อมูล ({n}/2 ครั้ง)
        </div>
      </div>
    );
  }
  const value = replay ?? n - 1;
  const label = snapT ? `${(Math.round(((Date.now() - snapT) / 3.6e6) * 10) / 10).toFixed(1)} ชม. ก่อน` : 'ปัจจุบัน';
  return (
    <div className={wrap} style={bottom}>
      <div className="glass flex items-center gap-3 rounded-2xl py-2 pl-2 pr-2 shadow-xl shadow-black/40">
        <button onClick={onLive} disabled={replay == null} aria-label="กลับไปปัจจุบัน" title="กลับไปปัจจุบัน"
          className={`grid size-10 shrink-0 place-items-center rounded-xl transition ${replay == null ? 'text-zinc-400' : 'bg-[#8fd3f4]/15 text-[#8fd3f4]'}`}>
          <History className="size-[18px]" />
        </button>
        <div className="w-[84px] shrink-0 leading-tight">
          <div className="text-[11px] text-zinc-400 max-sm:hidden">ย้อนดูข้อมูล 24 ชม.</div>
          <div className={`truncate text-sm font-semibold ${snapT ? 'text-[#8fd3f4]' : 'text-zinc-100'}`}>{label}</div>
        </div>
        <input type="range" className="replay-range min-w-0 flex-1" aria-label="เลื่อนดูระดับน้ำย้อนหลัง"
          min={0} max={n - 1} step={1} value={value}
          style={{ '--p': `${(value / (n - 1)) * 100}%` } as React.CSSProperties}
          onChange={(e) => onScrub(Number(e.target.value))} />
        <button onClick={onPlay} aria-label={playing ? 'หยุดเล่น' : 'เล่นย้อนหลัง'} title={playing ? 'หยุดเล่น' : 'เล่นย้อนหลัง'}
          className="btn-primary grid size-11 shrink-0 place-items-center rounded-full active:scale-95">
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
      </div>
    </div>
  );
}