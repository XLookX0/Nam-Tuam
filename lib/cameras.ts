/** Public camera info. The snapshot URLs themselves live ONLY in the Worker (CAMERAS variable), never in the website. */
export interface CameraMeta {
  id: string; // must match the id used in the Worker's CAMERAS variable
  name: string;
  subtitle?: string; // e.g. what the camera shows
  province?: string; // used for the filter chips on the cameras section
  approxPos?: boolean; // true = the position is only approximate (town / subdistrict level), and the website says so
  lat?: number; // optional: without a position the camera still shows in the grid, just not as a pin on the map
  lng?: number;
  stationId?: string | number; // nearest water station, shows its level on the card
  credit: string; // shown as "ภาพ: ..."
  live?: boolean; // true = shows the camera's current photo straight from /api/cam-source (no saved history, nothing to set up in Cloudflare)
}

export interface CamStatus extends CameraMeta {
  latestTs: number | null; // epoch seconds of the newest saved frame
  count: number; // frames kept (up to 3 days)
}

// ← EDIT THESE. All of these are Department of Water Resources (DWR) cameras; none was found in Samut Songkhram itself.
// Positions marked approxPos are only town / subdistrict level (typically within 1-3 km), not surveyed camera positions.
// Add `lat` and `lng` to a camera to show it as a pin on the map (in Google Maps: right-click the spot, click the numbers to copy them).
// A camera without lat/lng still appears in the grid. `live: true` = current photo only (see docs/SETUP.md for saved history).
export const CAMERAS: CameraMeta[] = [
  { id: 'dwr-ta130202', province: 'สมุทรสาคร', name: 'แม่น้ำท่าจีนที่ท่าฉลอม (TA130202)', subtitle: 'เห็นสเกลวัดระดับน้ำที่ประตูน้ำ จ.สมุทรสาคร', approxPos: true, lat: 13.5236, lng: 100.2713, credit: 'กรมทรัพยากรน้ำ (ทน.)', live: true },
  { id: 'dwr-ta130203', province: 'สมุทรสาคร', name: 'แม่น้ำท่าจีนที่สะพานข้ามแม่น้ำท่าจีน 3 (TA130203)', subtitle: 'จ.สมุทรสาคร อ.เมืองสมุทรสาคร ต.บ้านเกาะ', credit: 'กรมทรัพยากรน้ำ (ทน.)', live: true },
  { id: 'dwr-ta180304', province: 'เพชรบุรี', name: 'สะพานท่าแลงพัฒนา (TA180304)', subtitle: 'จ.เพชรบุรี อ.ท่ายาง ต.ท่าคอย', approxPos: true, lat: 12.998, lng: 99.9015, credit: 'กรมทรัพยากรน้ำ (ทน.)', live: true },
  { id: 'dwr-ta180305', province: 'เพชรบุรี', name: 'สะพานวัดตำหรุ (TA180305)', subtitle: 'จ.เพชรบุรี อ.บ้านลาด ต.ถ้ำรงค์', credit: 'กรมทรัพยากรน้ำ (ทน.)', live: true },
  { id: 'dwr-ta180307', province: 'เพชรบุรี', name: 'สะพานท่าสรง (TA180307)', subtitle: 'จ.เพชรบุรี อ.เมืองเพชรบุรี ต.ท่าราบ', approxPos: true, lat: 13.113, lng: 99.94, credit: 'กรมทรัพยากรน้ำ (ทน.)', live: true },
  { id: 'dwr-ta180308', province: 'เพชรบุรี', name: 'สะพานข้ามแม่น้ำเพชรบุรี ที่ อบต.บางครก (TA180308)', subtitle: 'จ.เพชรบุรี อ.บ้านแหลม ต.บางครก', credit: 'กรมทรัพยากรน้ำ (ทน.)', live: true },
  { id: 'dwr-tc180301', province: 'เพชรบุรี', name: 'เทศบาลเมืองเพชรบุรี (TC180301)', subtitle: 'จ.เพชรบุรี อ.เมืองเพชรบุรี ต.คลองกระแชง', approxPos: true, lat: 13.1119, lng: 99.9447, credit: 'กรมทรัพยากรน้ำ (ทน.)', live: true },
];

/** A camera can be pinned on the map only when it has a real position (0,0 counts as "not set"). */
export const hasPos = (c: { lat?: number; lng?: number }) =>
  Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0);

export const CAM_KEY = (id: string) => `cam:${id}:frames`;
export const CAM_MAX_DAYS = 3;

/** Where saved frames are served from: your Worker, e.g. https://nam-tuam.<you>.workers.dev (set NEXT_PUBLIC_CAM_BASE). */
export const CAM_BASE = (process.env.NEXT_PUBLIC_CAM_BASE ?? '').replace(/\/$/, '');
/** Live cameras: the bucket changes every 30 s so browsers fetch a fresh photo. */
export const liveUrl = (id: string, bucket: number) => `/api/cam-source/${id}?v=${bucket}`;
export const frameUrl = (id: string, ts: number) => `${CAM_BASE}/cam/${id}/${ts}.jpg`;

export function ageLabel(ts: number | null, nowMs: number): string {
  if (!ts) return 'ยังไม่มีภาพ';
  const min = Math.max(0, Math.round((nowMs / 1000 - ts) / 60));
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีก่อน`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} ชม.ก่อน` : `${Math.floor(h / 24)} วันก่อน`;
}

/** ok = fresh, late = older than 15 min, off = older than an hour or never */
export function camHealth(ts: number | null, nowMs: number): 'ok' | 'late' | 'off' {
  if (!ts) return 'off';
  const min = (nowMs / 1000 - ts) / 60;
  return min <= 15 ? 'ok' : min <= 60 ? 'late' : 'off';
}

export const fmtFrameTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

/** Camera glyph for map pins (same shape as the lucide "camera" icon). */
export const CAM_PIN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';