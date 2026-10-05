'use client';

import { useState } from 'react';
import {
  Building, Building2, Compass, Layers, LocateFixed, Maximize2, Minimize2, Map as MapIcon, RefreshCw, Route, Sailboat, Share2, Waves,
} from 'lucide-react';
import MapWrapper from '@/components/MapWrapper';
import { funIconSvg } from '@/lib/funIcons';
import type { Station, ColorBy, CameraMode, MapLayers } from '@/lib/station';
import { glass } from '@/lib/ui';

export interface MapStageProps {
  stations: Station[];
  selectedStation: Station | null;
  focusKey: number;
  userPos: [number, number] | null;
  colorBy: ColorBy;
  onColorBy: (c: ColorBy) => void;
  viewMode: '2d' | '3d';
  onViewMode: (m: '2d' | '3d') => void;
  fun: boolean;
  onFun: (f: boolean) => void;
  cam: { mode: CameraMode | null; key: number };
  onCam: (c: { mode: CameraMode | null; key: number }) => void;
  layers: MapLayers;
  onLayers: (l: MapLayers) => void;
  fullscreen: boolean;
  onFullscreen: (v: boolean) => void;
  onSelect: (s: Station) => void;
  onUnsupported: () => void;
  onLocate: () => void;
  onShare: () => void;
  onRefresh: () => void;
  loading: boolean;
  children?: React.ReactNode; // shown over the map in fullscreen (selected station card)
}

const seg = `${glass} flex shrink-0 rounded-xl p-0.5 text-xs`;
const segBtn = (on: boolean) => `px-3 py-1.5 rounded-[10px] font-medium transition ${on ? 'bg-[#8fd3f4] text-[#06242a]' : 'text-zinc-300 hover:text-white'}`;
const tool = `${glass} grid size-10 place-items-center rounded-xl text-zinc-200 transition hover:bg-white/10`;

export default function MapStage(p: MapStageProps) {
  const [more, setMore] = useState(false);
  const fs = p.fullscreen;
  const safeTop = { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' } as const;

  return (
    <div className={fs ? 'stage-fs fixed inset-0 z-[60] isolate bg-[#071a22]' : 'relative isolate h-full overflow-hidden rounded-3xl ring-1 ring-white/10'}>
      <div className="mapbox">
        <MapWrapper
          key={fs ? 'fullscreen' : 'inline'}
          mode={p.viewMode}
          stations={p.stations}
          selectedStation={p.selectedStation}
          focusKey={p.focusKey}
          colorBy={p.colorBy}
          userPos={p.userPos}
          onSelect={p.onSelect}
          camera={p.cam}
          layers={p.layers}
          fun={p.fun}
          onCameraEnd={() => p.onCam({ ...p.cam, mode: null })}
          onUnsupported={p.onUnsupported}
        />
      </div>

      {/* top bar: mode toggles on the left, tools on the right. One flex row, so they can never overlap each other. */}
      <div className="absolute inset-x-3 z-10 flex items-start justify-between gap-2" style={fs ? safeTop : { top: 12 }}>
        <div className="flex min-w-0 flex-wrap gap-2">
          <div role="group" aria-label="โหมดแผนที่" className={seg}>
            {(['2d', '3d'] as const).map((m) => (
              <button key={m} onClick={() => p.onViewMode(m)} aria-pressed={p.viewMode === m} className={segBtn(p.viewMode === m)}>
                {m === '2d' ? '2 มิติ' : '3 มิติ'}
              </button>
            ))}
          </div>
          <div role="group" aria-label="สีของจุด" className={seg}>
            {([['level', 'ระดับน้ำ'], ['trend', 'ทิศทาง']] as [ColorBy, string][]).map(([v, l]) => (
              <button key={v} onClick={() => p.onColorBy(v)} aria-pressed={p.colorBy === v} className={segBtn(p.colorBy === v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={p.onLocate} aria-label="ตำแหน่งของฉัน" title="ตำแหน่งของฉัน" className={tool}><LocateFixed className="size-4" /></button>
          {fs && <button onClick={p.onShare} aria-label="แชร์" title="แชร์" className={`${tool} max-sm:hidden`}><Share2 className="size-4" /></button>}
          {fs && <button onClick={p.onRefresh} aria-label="รีเฟรช" title="รีเฟรช" className={`${tool} max-sm:hidden`}><RefreshCw className={`size-4 ${p.loading ? 'animate-spin text-[#8fd3f4]' : ''}`} /></button>}
          <button onClick={() => p.onFullscreen(!fs)} aria-label={fs ? 'ออกจากเต็มจอ' : 'เปิดเต็มจอ'} title={fs ? 'ออกจากเต็มจอ' : 'เปิดเต็มจอ'}
            className={`${tool} ${fs ? 'bg-white/10' : ''}`}>
            {fs ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      {/* 3D tools: camera presets always visible; layers and fun mode in a popover on phones */}
      {p.viewMode === '3d' && (
        <div className="stage-dock">
          <div className={`${glass} flex flex-col gap-1 rounded-2xl p-1`}>
            {([['city', 'มุมเมือง', Building2], ['top', 'มองจากบน', MapIcon], ['tour', 'สำรวจจุดวัด', Compass]] as [CameraMode, string, typeof Building2][]).map(([m, label, Icon]) => (
              <button key={m} title={label} aria-label={label} aria-pressed={p.cam.mode === m}
                onClick={() => p.onCam({ mode: m, key: p.cam.key + 1 })}
                className={`grid size-10 place-items-center rounded-xl transition ${p.cam.mode === m ? 'bg-[#8fd3f4] text-[#06242a]' : 'text-zinc-300 hover:bg-white/10'}`}>
                <Icon className="size-[18px]" />
              </button>
            ))}
            <span className="mx-2 my-0.5 h-px bg-white/10 md:hidden" />
            <button title="เลเยอร์และเครื่องมือ" aria-label="เลเยอร์และเครื่องมือ" aria-expanded={more} onClick={() => setMore((v) => !v)}
              className={`grid size-10 place-items-center rounded-xl transition md:hidden ${more ? 'bg-white/15 text-white' : 'text-zinc-300 hover:bg-white/10'}`}>
              <Layers className="size-[18px]" />
            </button>
          </div>
          <div className={`${glass} flex flex-col gap-1 rounded-2xl p-1 max-md:flex-row max-md:items-center ${more ? '' : 'max-md:hidden'}`}>
            {([['canals', 'คลอง', Waves], ['roads', 'ถนน', Route], ['buildings', 'ตึก', Building]] as [keyof MapLayers, string, typeof Waves][]).map(([k, label, Icon]) => (
              <button key={k} title={label} aria-label={label} aria-pressed={p.layers[k]}
                onClick={() => p.onLayers({ ...p.layers, [k]: !p.layers[k] })}
                className={`grid size-10 place-items-center rounded-xl transition ${p.layers[k] ? 'bg-[#8fd3f4]/15 text-[#8fd3f4]' : 'text-zinc-400 hover:bg-white/10'}`}>
                <Icon className="size-[18px]" />
              </button>
            ))}
            <span className="mx-2 my-0.5 h-px bg-white/10 max-md:mx-0.5 max-md:my-1.5 max-md:h-auto max-md:w-px max-md:self-stretch" />
            <button title="โหมดสนุก" aria-label="โหมดสนุก" aria-pressed={p.fun} onClick={() => p.onFun(!p.fun)}
              className={`grid size-10 place-items-center rounded-xl transition ${p.fun ? 'bg-amber-400 text-zinc-950' : 'text-zinc-300 hover:bg-white/10'}`}>
              <Sailboat className="size-[18px]" />
            </button>
          </div>
        </div>
      )}

      {/* legend: status dots, or the vessels when fun mode is on */}
      <div className={`${glass} absolute left-3 z-10 hidden items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-zinc-200 sm:flex ${fs ? 'bottom-24' : 'bottom-3'}`}>
        {p.viewMode === '3d' && p.fun ? (
          (['duck', 'boat', 'sub'] as const).map((k, i) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="block h-6 w-8 shrink-0" dangerouslySetInnerHTML={{ __html: funIconSvg(k) }} />
              {['ปกติ', 'เฝ้าระวัง', 'วิกฤต'][i]}
            </span>
          ))
        ) : (
          <>
            {(p.colorBy === 'level'
              ? [['#3ecf8e', 'ปกติ'], ['#f5b544', 'เฝ้าระวัง'], ['#ff5d5d', 'วิกฤต']]
              : [['#ff7a59', 'ขึ้น'], ['#4fd1c5', 'ลด'], ['#7f9ca4', 'ทรงตัว']]
            ).map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border-2 border-zinc-500" />ไม่ส่งค่า</span>
            {p.viewMode === '3d' && <span className="hidden text-zinc-300 xl:inline">แท่ง = น้ำ หลอดใส = ตลิ่ง</span>}
          </>
        )}
      </div>

      {fs && p.children && <div className="absolute inset-x-3 bottom-24 z-10 md:right-auto md:w-[400px]">{p.children}</div>}
    </div>
  );
}