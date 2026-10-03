import { redis } from '@/lib/redis';
import { HISTORY_KEY, HISTORY_MAX, Snapshot } from '@/lib/history';

export const dynamic = 'force-dynamic';

/** Last 24 hours of snapshots, oldest first. One Redis command per cache miss. */
export async function GET() {
  try {
    // The SDK parses JSON values back into objects; tolerate raw strings too.
    const raw = (await redis.lrange(HISTORY_KEY, 0, HISTORY_MAX - 1)) as unknown[];
    const cutoff = Date.now() - 24 * 3600e3 - 20 * 60e3;
    const snapshots = raw
      .map((x) => {
        if (typeof x !== 'string') return x as Snapshot;
        try {
          return JSON.parse(x) as Snapshot;
        } catch {
          return null;
        }
      })
      .filter((x): x is Snapshot => !!x && typeof x.t === 'number' && x.t >= cutoff)
      .reverse();
    return Response.json({ snapshots }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } });
  } catch (err) {
    console.error('[history]', err);
    return Response.json({ snapshots: [] });
  }
}