import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Station, isStale } from './station';

export const STATUS = {
  critical: { label: 'วิกฤต', bar: 'bg-red-500', text: 'text-red-400', chip: 'bg-red-500/15 text-red-300' },
  warning: { label: 'เฝ้าระวัง', bar: 'bg-amber-400', text: 'text-amber-300', chip: 'bg-amber-400/15 text-amber-200' },
  normal: { label: 'ปกติ', bar: 'bg-emerald-400', text: 'text-emerald-300', chip: 'bg-emerald-400/15 text-emerald-200' },
  stale: { label: 'ไม่ส่งค่า', bar: 'bg-zinc-500', text: 'text-zinc-400', chip: 'bg-white/10 text-zinc-300' },
} as const;
export type Key = keyof typeof STATUS;
export const kOf = (s: Station): Key =>
  isStale(s) ? 'stale' : s.status === 'critical' || s.status === 'warning' ? s.status : 'normal';

export const TREND = {
  rising: { label: 'กำลังขึ้น', Icon: ArrowUp, text: 'text-orange-400', bg: 'bg-orange-400' },
  falling: { label: 'กำลังลด', Icon: ArrowDown, text: 'text-cyan-300', bg: 'bg-cyan-300' },
  stable: { label: 'ทรงตัว', Icon: Minus, text: 'text-zinc-400', bg: 'bg-zinc-400' },
} as const;
export const tOf = (s: Station) => TREND[s.trend] ?? TREND.stable;

export const glass = 'glass';
export const card = 'rounded-3xl bg-white/[0.035] ring-1 ring-white/10';
export const sub = 'rounded-2xl bg-white/[0.04] ring-1 ring-white/10';
export const iconBtn =
  'grid place-items-center size-10 rounded-xl text-zinc-300 hover:bg-white/10 active:bg-white/15 transition shrink-0';