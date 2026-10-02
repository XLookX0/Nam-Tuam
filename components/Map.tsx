'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export interface Station {
  id: number | string;
  name: string;
  lat: number;
  lng: number;
  waterLevel: number;
  bankHeight: number;
  capacityPercent: number;
  status: 'normal' | 'warning' | 'critical';
  trend: 'rising' | 'falling' | 'stable';
  updatedAt: string;
}

function MapViewController({ selectedStation }: { selectedStation: Station | null }) {
  const map = useMap();
  useEffect(() => {
    if (selectedStation) {
      map.flyTo([selectedStation.lat, selectedStation.lng], 14, { duration: 1.5 });
    }
  }, [selectedStation, map]);
  return null;
}

const createCustomIcon = (status: Station['status']) => {
  let colorClass = 'bg-emerald-500 border-emerald-300';
  let extraClass = '';

  if (status === 'warning') {
    colorClass = 'bg-amber-500 border-amber-300';
  } else if (status === 'critical') {
    colorClass = 'bg-red-500 border-red-300';
    extraClass = 'marker-critical-dot';
  }

  return L.divIcon({
    className: 'custom-web-marker',
    html: `<div class="w-5 h-5 rounded-full border-2 ${colorClass} ${extraClass} shadow-lg"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

export default function Map({ stations, selectedStation }: { stations: Station[]; selectedStation: Station | null }) {
  // Samut Songkhram Center Coordinates
  const position: [number, number] = [13.4093, 100.0022];

  return (
    <MapContainer center={position} zoom={12} className="w-full h-full z-0" zoomControl={false}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      <MapViewController selectedStation={selectedStation} />

      {stations.map((st) => (
        <Marker key={st.id} position={[st.lat, st.lng]} icon={createCustomIcon(st.status)}>
          <Popup>
            <div className="p-1 space-y-2">
              <h3 className="font-semibold text-sm text-zinc-100">{st.name}</h3>
              <div className="text-xs text-zinc-400 space-y-1">
                <div className="flex justify-between">
                  <span>ระดับน้ำปัจจุบัน:</span>
                  <span className="font-bold text-zinc-200">{st.waterLevel} ม.</span>
                </div>
                <div className="flex justify-between">
                  <span>ความสูงตลิ่ง:</span>
                  <span>{st.bankHeight} ม.</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-zinc-800">
                  <span>แนวโน้ม:</span>
                  <span className="flex items-center gap-1 font-medium">
                    {st.trend === 'rising' && <ArrowUp className="w-3 h-3 text-red-400" />}
                    {st.trend === 'falling' && <ArrowDown className="w-3 h-3 text-emerald-400" />}
                    {st.trend === 'stable' && <Minus className="w-3 h-3 text-zinc-400" />}
                    {st.trend === 'rising' ? 'กำลังขึ้น' : st.trend === 'falling' ? 'กำลังลด' : 'ทรงตัว'}
                  </span>
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}