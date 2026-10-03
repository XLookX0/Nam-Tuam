import type { Station } from './station';

/** Fun mode: a little vessel floats on top of each pillar. Original artwork, kept deliberately simple. */
export type FunKind = 'duck' | 'boat' | 'sub';

export const funKind = (s: Station): FunKind => (s.status === 'critical' ? 'sub' : s.status === 'warning' ? 'boat' : 'duck');

const ripple = '<ellipse cx="26" cy="38" rx="21" ry="3" fill="none" stroke="#4fd1c5" stroke-opacity=".65" stroke-width="1.6"/>';

const ART: Record<FunKind, string> = {
  duck: `${ripple}
    <path d="M6 25q-4-4-2-9 6 1 8 7z" fill="#ffd23f"/>
    <ellipse cx="22" cy="29" rx="16" ry="9" fill="#ffd23f"/>
    <circle cx="33" cy="17" r="8" fill="#ffd23f"/>
    <path d="M40 17q7 1 7 3-3 3-8 0z" fill="#ff8a1f"/>
    <circle cx="35.5" cy="15" r="1.6" fill="#1b2a30"/>
    <path d="M13 28q8 8 17 0-6-3-17 0z" fill="#f2b705"/>`,
  boat: `${ripple}
    <path d="M26 17V8" stroke="#e8f1ef" stroke-width="1.6"/>
    <path d="M26 8l8 2.5-8 2.5z" fill="#ff5d5d"/>
    <path d="M15 28l5-10h12l5 10z" fill="#9fd8ee"/>
    <path d="M3 28h46l-6 9H9z" fill="#f4f7f8"/>
    <path d="M5.5 31h41l-1.6 2.6H7.1z" fill="#ff5d5d"/>`,
  sub: `${ripple}
    <path d="M30 15V7h7" stroke="#6f858c" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <rect x="22" y="14" width="13" height="10" rx="3" fill="#6f858c"/>
    <ellipse cx="26" cy="29" rx="20" ry="9" fill="#8aa0a7"/>
    <circle cx="16" cy="29" r="2.4" fill="#cfe9f2"/>
    <circle cx="25" cy="29" r="2.4" fill="#cfe9f2"/>
    <circle cx="34" cy="29" r="2.4" fill="#cfe9f2"/>
    <path d="M47 23v12" stroke="#6f858c" stroke-width="3" stroke-linecap="round"/>`,
};

export const funIconSvg = (k: FunKind) => `<svg class="fun-svg" viewBox="0 0 52 42" aria-hidden="true">${ART[k]}</svg>`;