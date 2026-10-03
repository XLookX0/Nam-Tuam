'use client';

import dynamic from 'next/dynamic';
import type { MapProps } from './Map';

const loading = () => (
  <div className="w-full h-full bg-zinc-950 flex items-center justify-center text-zinc-400 text-sm">กำลังโหลดแผนที่...</div>
);

// Separate dynamic imports: 2D users never download the 3D (MapLibre) bundle, and vice versa.
const Map2D = dynamic(() => import('./Map'), { ssr: false, loading });
const Map3D = dynamic(() => import('./Map3D'), { ssr: false, loading });

export default function MapWrapper({ mode = '2d', ...props }: MapProps & { mode?: '2d' | '3d' }) {
  return mode === '3d' ? <Map3D {...props} /> : <Map2D {...props} />;
}