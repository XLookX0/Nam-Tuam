/** Public camera info. The snapshot URLs themselves live ONLY in the Worker (CAMERAS variable), never in the website. */
export interface CameraMeta {
  id: string; // must match the id used in the Worker's CAMERAS variable
  name: string;
  subtitle?: string; // e.g. what the camera shows
  lat: number;
  lng: number;
  stationId?: string | number; // nearest water station, shows its level on the card
  credit: string; // shown as "ภาพ: ..."
}

export interface CamStatus extends CameraMeta {
  latestTs: number | null; // epoch seconds of the newest saved frame
  count: number; // frames kept (up to 3 days)
}

// ← EDIT THESE: your real cameras (names, positions, credit). Keep ids in sync with the Worker.
export const CAMERAS: CameraMeta[] = [
  { id: 'cam-01', name: 'ปากอ่าวแม่กลอง', subtitle: 'มองเห็นระดับน้ำริมแม่น้ำแม่กลอง', lat: 13.414006, lng: 100.000623, stationId: 'TELE_SKM_03', credit: 'กล้องของโครงการ' },
  { id: 'cam-02', name: 'หน้าวัดอัมพวันเจติยาราม', subtitle: 'ริมแม่น้ำแม่กลอง อัมพวา', lat: 13.424368, lng: 99.954497, stationId: 'TELE_SKM_02', credit: 'กล้องของโครงการ' },
  { id: 'cam-03', name: 'ประตูระบายน้ำคลองอัมพวา', subtitle: 'ดูการระบายน้ำเข้าออกคลอง', lat: 13.4305, lng: 99.9628, stationId: 'TELE_SKM_05', credit: 'กล้องของโครงการ' },
];

export const CAM_KEY = (id: string) => `cam:${id}:frames`;
export const CAM_MAX_DAYS = 3;

/** Where saved frames are served from: your Worker, e.g. https://nam-tuam.<you>.workers.dev (set NEXT_PUBLIC_CAM_BASE). */
export const CAM_BASE = (process.env.NEXT_PUBLIC_CAM_BASE ?? '').replace(/\/$/, '');
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