import { redis } from '@/lib/redis';
import { buildSnapshot, HISTORY_KEY, HISTORY_MAX } from '@/lib/history';

export const dynamic = 'force-dynamic';

/**
 * Called by the Cloudflare Worker every 15 minutes (see setup notes).
 * Reads the current stations through your existing /api/water-data route and pushes a compact snapshot into Redis.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const res = await fetch(new URL('/api/water-data', req.url), { cache: 'no-store' });
  if (!res.ok) return Response.json({ error: `water-data responded ${res.status}` }, { status: 502 });
  const data = await res.json();

  const snap = buildSnapshot(data.waterLevels ?? [], Date.now());
  const count = Object.keys(snap.d).length;
  if (!count) return Response.json({ skipped: 'no reporting stations' });

  // Newest first; keep the latest HISTORY_MAX entries. The SDK serialises the object for us.
  await redis.pipeline().lpush(HISTORY_KEY, snap).ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1).exec();
  return Response.json({ ok: true, stations: count });
}