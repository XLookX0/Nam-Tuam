import { digestAuthHeader } from '@/lib/digest';

export const dynamic = 'force-dynamic';

/**
 * Live camera photo. The website asks this route for a picture; the route fetches it from the camera (which only
 * offers an http:// address with a user name and password, like the DWR Axis cameras) and hands back a plain JPEG over HTTPS.
 *
 * - DWR shows the login of its public cameras to everyone on its own page, so the first camera is built in below.
 *   To add cameras (or change a login) without touching code, set the Vercel variable CAM_SOURCES, for example:
 *   {"dwr-ta130203":{"base":"http://host:port","user":"live","pass":"..."}}
 * - A photo is reused for 45 seconds, so however many people look, the camera is asked at most about once a minute.
 */
interface Source {
  base: string; // http://host:port
  user?: string;
  pass?: string;
  snapshotPath?: string; // default: Axis single photo
  streamPath?: string; // default: Axis MJPEG stream (used if the single photo is unavailable)
}

const DEFAULT_SOURCES: Record<string, Source> = {
  'dwr-ta130202': { base: 'http://ta130202.dyndns.info:5001', user: 'live', pass: 'Live2025!' },
};

function sources(): Record<string, Source> {
  try {
    return { ...DEFAULT_SOURCES, ...JSON.parse(process.env.CAM_SOURCES || '{}') };
  } catch {
    return DEFAULT_SOURCES;
  }
}

const UA = 'Mozilla/5.0 (compatible; nam-tuam-cam/1.0)';
const memo = new Map<string, { at: number; jpeg: Uint8Array }>();

const isJpeg = (b: Uint8Array) => b.length > 2000 && b.length < 3_000_000 && b[0] === 0xff && b[1] === 0xd8;

function find(arr: Uint8Array, a: number, b: number, from = 0) {
  for (let i = from; i < arr.length - 1; i++) if (arr[i] === a && arr[i + 1] === b) return i;
  return -1;
}

/** Fetch with the camera's login. Asks first, then answers whichever challenge it gets (Digest or Basic). */
async function authedFetch(urlStr: string, src: Source): Promise<Response> {
  const opts = { cache: 'no-store' as const, signal: AbortSignal.timeout(9000) };
  const base = { 'User-Agent': UA };
  if (!src.user) return fetch(urlStr, { ...opts, headers: base });
  const first = await fetch(urlStr, { ...opts, headers: base });
  if (first.status !== 401) return first;
  const challenge = first.headers.get('www-authenticate') || '';
  await first.body?.cancel().catch(() => {});
  const u = new URL(urlStr);
  const i = challenge.search(/digest/i);
  const auth =
    i >= 0
      ? digestAuthHeader(challenge.slice(i), src.user, src.pass ?? '', 'GET', u.pathname + u.search)
      : `Basic ${Buffer.from(`${src.user}:${src.pass ?? ''}`).toString('base64')}`;
  return fetch(urlStr, { ...opts, headers: { ...base, Authorization: auth } });
}

/** Read an MJPEG stream just far enough to cut out the first complete JPEG, then hang up. */
async function firstJpegFromStream(res: Response): Promise<Uint8Array | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const next = new Uint8Array(buf.length + value.length);
      next.set(buf);
      next.set(value, buf.length);
      buf = next;
      const s = find(buf, 0xff, 0xd8);
      if (s >= 0) {
        const e = find(buf, 0xff, 0xd9, s + 2);
        if (e >= 0) return buf.slice(s, e + 2);
      }
      if (buf.length > 3_000_000) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return null;
}

const reply = (jpeg: Uint8Array, stale = false) =>
  new Response(Buffer.from(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=30, s-maxage=45, stale-while-revalidate=60',
      ...(stale ? { 'X-Stale': '1' } : {}),
    },
  });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const src = sources()[id];
  if (!src?.base) return new Response('unknown camera', { status: 404 });

  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < 45_000) return reply(hit.jpeg);

  const base = src.base.replace(/\/$/, '');
  const attempt = async (path: string, stream: boolean) => {
    try {
      const res = await authedFetch(base + path, src);
      if (!res.ok) return null;
      if (stream) return await firstJpegFromStream(res);
      const b = new Uint8Array(await res.arrayBuffer());
      return isJpeg(b) ? b : null;
    } catch {
      return null;
    }
  };

  const jpeg =
    (await attempt(src.snapshotPath ?? '/axis-cgi/jpg/image.cgi', false)) ??
    (await attempt(src.streamPath ?? '/axis-cgi/mjpg/video.cgi', true));

  if (jpeg && isJpeg(jpeg)) {
    memo.set(id, { at: Date.now(), jpeg });
    return reply(jpeg);
  }
  // camera briefly unreachable: a recent photo is better than an error
  if (hit && Date.now() - hit.at < 10 * 60_000) return reply(hit.jpeg, true);
  return new Response('camera did not return a photo', { status: 502 });
}