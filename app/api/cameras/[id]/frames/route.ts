import { redis } from '@/lib/redis';
import { CAMERAS, CAM_KEY } from '@/lib/cameras';

export const dynamic = 'force-dynamic';

/** Timestamps (epoch seconds, oldest first) of every saved frame for one camera: up to 3 days, ~1,440 numbers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CAMERAS.some((c) => c.id === id)) return new Response('not found', { status: 404 });
  try {
    const raw = (await redis.zrange(CAM_KEY(id), 0, -1)) as unknown[];
    const frames = raw.map(Number).filter((n) => Number.isFinite(n));
    return Response.json({ id, frames }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  } catch (err) {
    console.error('[cameras frames]', err);
    return Response.json({ id, frames: [] });
  }
}