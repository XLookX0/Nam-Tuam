import { redis } from '@/lib/redis';
import { CAMERAS, CAM_KEY, CamStatus } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

/** Camera list with the newest frame time and how many frames are stored. Two Redis commands per camera, cached 30 s. */
export async function GET() {
  const empty: CamStatus[] = CAMERAS.map((c) => ({ ...c, latestTs: null, count: 0 }));
  try {
    const p = redis.pipeline();
    CAMERAS.forEach((c) => {
      p.zrange(CAM_KEY(c.id), -1, -1);
      p.zcard(CAM_KEY(c.id));
    });
    const out = (await p.exec()) as unknown[];
    const cameras: CamStatus[] = CAMERAS.map((c, i) => {
      const last = (out[i * 2] as unknown[] | undefined)?.[0];
      return { ...c, latestTs: last != null ? Number(last) : null, count: Number(out[i * 2 + 1]) || 0 };
    });
    return Response.json({ cameras }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  } catch (err) {
    console.error('[cameras]', err);
    return Response.json({ cameras: empty });
  }
}