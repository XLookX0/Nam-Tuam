'use client';

import { useEffect, useState } from 'react';
import { Droplets, LocateFixed, Menu, Share2, X, Box } from 'lucide-react';

export const NAV: [string, string][] = [
  ['ย่านของฉัน', 'my-area'],
  ['ภาพรวม', 'overview'],
  ['แผนที่', 'map'],
  ['ย้อนหลัง', 'history'],
  ['น้ำขึ้นลง', 'tide'],
  ['ทุกจุดวัด', 'stations'],
];

const topStyle = { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' } as const;

function Brand({ collapse = false }: { collapse?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-2.5 shrink-0" aria-label="กลับขึ้นด้านบน">
      <span className="grid place-items-center size-9 rounded-xl bg-[#8fd3f4]/15 text-[#8fd3f4]"><Droplets className="size-5" /></span>
      <span className={`font-semibold leading-none whitespace-nowrap ${collapse ? 'hidden xl:inline' : ''}`}>
        สมุทรสงคราม <span className="text-[#8fd3f4]">Flood</span>
      </span>
    </a>
  );
}

export default function SiteNav({ onNear, onOpen3D, onShare }: { onNear: () => void; onOpen3D: () => void; onShare: () => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-35% 0px -60% 0px' }
    );
    NAV.forEach(([, id]) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* Desktop: floating pill. The wrapper spans the screen and centres the pill, so the pill is never squeezed to half the width. */}
      <div style={topStyle} className="pointer-events-none fixed inset-x-0 z-50 hidden justify-center px-4 lg:flex">
        <nav aria-label="เมนูหลัก"
          className="glass pointer-events-auto flex max-w-full items-center gap-1 whitespace-nowrap rounded-full py-2 pl-4 pr-2 shadow-xl shadow-black/30">
          <Brand collapse />
          <span className="mx-2 h-6 w-px bg-white/10" />
          {NAV.map(([label, id]) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined}
              className={`rounded-full px-3.5 py-2 text-sm transition ${active === id ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white'}`}>
              {label}
            </a>
          ))}
          <button onClick={onOpen3D} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-[#8fd3f4] transition hover:bg-white/5">
            <Box className="size-4" /> 3 มิติ
          </button>
          <button onClick={onNear} className="ml-1 flex items-center gap-1.5 rounded-full bg-[#8fd3f4]/15 px-4 py-2 text-sm font-medium text-[#8fd3f4] transition hover:bg-[#8fd3f4]/25">
            <LocateFixed className="size-4" /> ใกล้ฉัน
          </button>
        </nav>
      </div>

      {/* Phones and tablets: compact bar + full-screen menu */}
      <nav aria-label="เมนูหลัก" style={topStyle}
        className="glass fixed inset-x-3 z-50 flex h-14 items-center justify-between rounded-2xl pl-3 pr-2 shadow-xl shadow-black/30 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1.5">
          <button onClick={onNear} className="flex items-center gap-1.5 rounded-full bg-[#8fd3f4] px-3.5 py-2 text-sm font-semibold text-[#06242a] active:scale-95 transition">
            <LocateFixed className="size-4" /> ใกล้ฉัน
          </button>
          <button onClick={() => setOpen(true)} aria-label="เปิดเมนู" className="grid size-10 place-items-center rounded-full text-zinc-200 hover:bg-white/10">
            <Menu className="size-5" />
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#06121a]/95 backdrop-blur-2xl lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }} className="px-3">
            <div className="glass flex h-14 items-center justify-between rounded-2xl pl-3 pr-2">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="ปิดเมนู" className="grid size-10 place-items-center rounded-full text-zinc-200 hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
          </div>
          <ul className="px-7 pb-16 pt-10 space-y-1">
            {NAV.map(([label, id]) => (
              <li key={id}>
                <a href={`#${id}`} onClick={() => setOpen(false)} className="block py-3 text-3xl font-semibold tracking-tight text-zinc-100 active:text-[#8fd3f4]">
                  {label}
                </a>
              </li>
            ))}
            <li>
              <button onClick={() => { setOpen(false); onOpen3D(); }} className="flex items-center gap-2 py-3 text-3xl font-semibold tracking-tight text-[#8fd3f4]">
                แผนที่ 3 มิติ
              </button>
            </li>
            <li className="pt-6">
              <button onClick={() => { setOpen(false); onShare(); }} className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-base font-medium text-zinc-100">
                <Share2 className="size-4" /> แชร์หน้านี้
              </button>
            </li>
          </ul>
        </div>
      )}
    </>
  );
}