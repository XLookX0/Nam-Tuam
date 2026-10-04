'use client';

/**
 * Night riverside scene (stilt-house village, coconut palms, a lit temple, longtail boats) with a staff gauge.
 * The water surface follows the average level: 0% at the bottom of the gauge, 100% = bank top.
 */

const ZERO_Y = 452; // gauge 0%
const BANK_Y = 272; // gauge 100% (top of the embankment)
const yFor = (pct: number) => ZERO_Y - ((ZERO_Y - BANK_Y) / 100) * Math.max(0, Math.min(pct, 108));

// deterministic "random" so the scene never changes between renders
const rnd = (() => {
  let s = 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
})();
const STARS = Array.from({ length: 34 }, () => ({ x: rnd() * 960, y: 8 + rnd() * 150, r: 0.6 + rnd() * 1.1, d: rnd() * 4 }));
const HOUSES: [number, number, number][] = [ // x, width, height of the far shophouses / stilt houses
  [0, 54, 62], [58, 40, 84], [102, 60, 52], [166, 36, 70], [206, 58, 90], [268, 44, 58], [316, 62, 76],
  [382, 38, 50], [424, 52, 66], [480, 40, 54], [880, 46, 70], [930, 40, 58],
];
const WINDOWS = HOUSES.flatMap(([x, w, h], i) =>
  Array.from({ length: 3 }, (_, j) => ({ x: x + 8 + j * ((w - 16) / 2.4), y: BANK_Y - h + 14 + ((i + j) % 2) * 20, on: (i * 3 + j) % 3 !== 0 }))
);
const BALUSTERS = Array.from({ length: 69 }, (_, i) => 6 + i * 14);
const WAVE = 'M-140 0' + ' q17.5 -6 35 0 t35 0'.repeat(1) + ' t35 0'.repeat(33);

function Palm({ x, h, lean, s = 1 }: { x: number; h: number; lean: number; s?: number }) {
  const tx = x + lean, ty = BANK_Y - h;
  return (
    <g>
      <path d={`M${x} ${BANK_Y} Q${x + lean * 0.2} ${BANK_Y - h * 0.55} ${tx} ${ty}`} stroke="#0a2230" strokeWidth={6 * s} fill="none" strokeLinecap="round" />
      <g transform={`translate(${tx} ${ty}) scale(${s})`} stroke="#0a2230" strokeWidth="4" fill="none" strokeLinecap="round">
        {[-80, -45, -10, 25, 60, 95, 130].map((a) => (
          <path key={a} d="M0 0 Q30 -20 66 2" transform={`rotate(${a})`} />
        ))}
      </g>
    </g>
  );
}

function Lamp({ x }: { x: number }) {
  return (
    <g>
      <rect x={x - 1.5} y={BANK_Y - 62} width="3" height="62" fill="#0a2230" />
      <circle cx={x} cy={BANK_Y - 66} r="34" fill="url(#lampGlow)" />
      <circle cx={x} cy={BANK_Y - 66} r="4.5" fill="#ffe6a3" />
    </g>
  );
}

function Boat({ x, flip = false, dur = 4 }: { x: number; flip?: boolean; dur?: number }) {
  return (
    <g transform={`translate(${x} -3) scale(${flip ? -1 : 1} 1)`}>
      <g style={{ animation: `scene-bob ${dur}s ease-in-out infinite`, transformOrigin: '0 6px' }}>
        <path d="M-34 -2 L30 -2 Q40 -2 46 -12 L42 -2 L34 7 L-26 7 Z" fill="#b2492f" />
        <path d="M-26 7 L34 7" stroke="#ffd7a1" strokeWidth="1.2" opacity=".6" />
        <path d="M-14 -2 V-12 H14 V-2" fill="#10303d" stroke="#e8b64c" strokeWidth="1.2" />
        <circle cx="42" cy="-14" r="9" fill="url(#lampGlow)" />
        <circle cx="42" cy="-14" r="2.2" fill="#ffe6a3" />
      </g>
    </g>
  );
}

export default function HeroScene({ pct, status, label }: { pct: number; status: 'normal' | 'warning' | 'critical'; label: string }) {
  const surf = yFor(pct);
  const tone = status === 'critical' ? '#ff6b6b' : status === 'warning' ? '#f7c35c' : '#5eead4';
  const lines: [number, string, string][] = [
    [100, 'ตลิ่ง', '#cfe3e8'],
    [90, 'วิกฤต', '#ff6b6b'],
    [70, 'เฝ้าระวัง', '#f7c35c'],
  ];
  return (
    <svg viewBox="0 0 960 480" className="h-auto w-full" role="img" aria-label={`ภาพประกอบริมคลองยามค่ำคืน ระดับน้ำเฉลี่ย ${Math.round(pct)}% ของตลิ่ง`}>
      <defs>
        <radialGradient id="moonGlow"><stop offset="0" stopColor="#dff3ff" stopOpacity=".45" /><stop offset="1" stopColor="#dff3ff" stopOpacity="0" /></radialGradient>
        <radialGradient id="lampGlow"><stop offset="0" stopColor="#ffd98a" stopOpacity=".7" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
        <radialGradient id="templeGlow"><stop offset="0" stopColor="#ffcf7a" stopOpacity=".35" /><stop offset="1" stopColor="#ffcf7a" stopOpacity="0" /></radialGradient>
        <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3fb7cc" stopOpacity=".92" /><stop offset="1" stopColor="#0d3a4b" stopOpacity=".96" /></linearGradient>
        <linearGradient id="wallFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#28505f" /><stop offset="1" stopColor="#14313d" /></linearGradient>
        <clipPath id="sceneClip"><rect x="0" y="0" width="960" height="480" /></clipPath>
      </defs>

      <g clipPath="url(#sceneClip)">
        {/* sky */}
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#e8f4ff" opacity=".8" style={{ animation: `scene-twinkle 3.6s ease-in-out ${s.d}s infinite` }} />
        ))}
        <circle cx="800" cy="84" r="150" fill="url(#moonGlow)" />
        <circle cx="800" cy="84" r="34" fill="#f6fbff" />
        <circle cx="788" cy="76" r="6" fill="#dbe9f3" opacity=".7" />

        {/* far houses */}
        {HOUSES.map(([x, w, h], i) => (
          <g key={i}>
            <rect x={x} y={BANK_Y - h} width={w} height={h} fill="#0d2431" />
            <path d={`M${x - 4} ${BANK_Y - h} L${x + w / 2} ${BANK_Y - h - 16} L${x + w + 4} ${BANK_Y - h} Z`} fill="#0a1d29" />
          </g>
        ))}
        {WINDOWS.map((w, i) => (w.on ? <rect key={i} x={w.x} y={w.y} width="6" height="8" fill="#f3c969" opacity=".8" /> : null))}

        {/* palms */}
        <Palm x={44} h={150} lean={26} s={1.05} />
        <Palm x={505} h={120} lean={-22} />
        <Palm x={930} h={170} lean={-30} s={1.1} />

        {/* temple, drawn as gold outlines like a lit silhouette */}
        <ellipse cx="640" cy="215" rx="190" ry="110" fill="url(#templeGlow)" />
        <g stroke="#e8b64c" strokeWidth="2" strokeLinejoin="round" fill="#0c2330">
          <rect x="560" y="226" width="150" height="46" />
          <path d="M546 228 L635 168 L724 228 Z" />
          <path d="M572 196 L635 148 L698 196 Z" />
          <path d="M635 148 q-3 -16 8 -26" fill="none" />
          <path d="M546 228 q-8 4 -12 -4 M724 228 q8 4 12 -4" fill="none" />
          <path d="M614 272 v-24 a21 24 0 0 1 42 0 v24" fill="#f3c969" fillOpacity=".25" />
        </g>
        <g stroke="#e8b64c" strokeWidth="2" strokeLinejoin="round" fill="#0c2330">
          <path d="M758 272 V210 L766 178 L772 130 L778 96 L784 130 L790 178 L798 210 V272 Z" />
          <path d="M778 96 V70" fill="none" />
          <path d="M752 272 V240 L758 226 M804 272 V240 L798 226" fill="none" />
        </g>
        <Lamp x={470} />
        <Lamp x={868} />

        {/* embankment */}
        <rect x="0" y={BANK_Y} width="960" height="210" fill="url(#wallFill)" />
        <rect x="0" y={BANK_Y - 2} width="960" height="4" fill="#3b6a7b" />
        <g stroke="#2c5262" strokeWidth="1.4" opacity=".9">
          <path d={`M0 ${BANK_Y - 12} H960`} />
          {BALUSTERS.map((x) => <path key={x} d={`M${x} ${BANK_Y - 12} V${BANK_Y - 2}`} />)}
        </g>

        {/* staff gauge */}
        <g>
          <rect x="868" y={BANK_Y - 14} width="20" height={ZERO_Y - BANK_Y + 40} rx="2" fill="#d9e3e6" />
          {Array.from({ length: 11 }, (_, i) => (
            <rect key={i} x={i % 5 === 0 ? 871 : 874} y={yFor(i * 10) - 1.5} width={i % 5 === 0 ? 14 : 8} height="3" fill="#d0463d" />
          ))}
        </g>

        {/* water */}
        <g style={{ transform: `translateY(${surf}px)`, transition: 'transform 1.2s cubic-bezier(.3,.7,.2,1)' }}>
          <g className="scene-wave"><path d={`${WAVE} V300 H-140 Z`} fill="url(#waterFill)" /></g>
          <path d="M0 3 H960" stroke="#bff3ff" strokeWidth="1" opacity=".35" />
          <Boat x={170} dur={4.2} />
          <Boat x={400} flip dur={5} />
          <g transform="translate(0 -14)">
            <rect x="676" y="-26" width="170" height="26" rx="13" fill="#071a22" stroke={tone} strokeOpacity=".7" />
            <text x="761" y="-8.5" textAnchor="middle" fontSize="14" fontWeight="600" fill={tone}>{label}</text>
          </g>
        </g>

        {/* threshold lines across the scene */}
        {lines.map(([p, name, c]) => (
          <g key={name}>
            <path d={`M0 ${yFor(p)} H890`} stroke={c} strokeWidth="1.6" strokeDasharray="7 7" opacity=".75" />
            <text x="894" y={yFor(p) + 4} fontSize="12" fontWeight="600" fill={c}>{name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}