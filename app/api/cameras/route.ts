import { redis } from '@/lib/redis';
import { CAMERAS, CAM_KEY, CamStatus } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

/** Camera list with the newest frame time and how many frames are stored. Two Redis commands per camera, cached 30 s. */
export async function GET() {
  const nowSec = Math.floor(Date.now() / 1000);
  const base: CamStatus[] = CAMERAS.map((c) => ({ ...c, latestTs: c.live ? nowSec : null, count: 0 }));
  const archive = CAMERAS.filter((c) => !c.live);
  if (archive.length === 0) return Response.json({ cameras: base }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  try {
    const p = redis.pipeline();
    archive.forEach((c) => {
      p.zrange(CAM_KEY(c.id), -1, -1);
      p.zcard(CAM_KEY(c.id));
    });
    const out = (await p.exec()) as unknown[];
    const cameras: CamStatus[] = base.map((c) => {
      const i = archive.findIndex((a) => a.id === c.id);
      if (i < 0) return c;
      const last = (out[i * 2] as unknown[] | undefined)?.[0];
      return { ...c, latestTs: last != null ? Number(last) : null, count: Number(out[i * 2 + 1]) || 0 };
    });
    return Response.json({ cameras }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  } catch (err) {
    console.error('[cameras]', err);
    return Response.json({ cameras: base });
  }
}