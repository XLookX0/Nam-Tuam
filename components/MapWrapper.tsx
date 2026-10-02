'use client';

import dynamic from 'next/dynamic';
import type { MapProps } from './Map';

const MapComponent = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">
      กำลังโหลดแผนที่...
    </div>
  ),
});

export default function MapWrapper(props: MapProps) {
  return <MapComponent {...props} />;
}