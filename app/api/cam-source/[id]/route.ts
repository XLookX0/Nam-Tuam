export const dynamic = 'force-dynamic';

/**
 * Camera proxy: turns a camera that only offers an http:// address with a user name and password (like the DWR
 * Axis cameras) into a plain HTTPS photo URL that your Cloudflare Worker can download.
 *  - Cloudflare Workers can't put a password inside a URL, and have trouble with custom ports such as :5001. Vercel has neither problem.
 *  - The camera's login stays in the CAM_SOURCES environment variable; it is never sent to the browser.
 *  - Only the Worker may call this route (shared secret in the `x-cam-key` header).
 *
 * Vercel environment variables:
 *   CAM_PROXY_KEY  any long random string (the Worker sends the same value in its CAMERAS entry)
 *   CAM_SOURCES    JSON, e.g. {"dwr-ta130202":{"base":"http://ta130202.dyndns.info:5001","user":"live","pass":"..."}}
 */
interface Source {
  base: string; // http://host:port
  user?: string;
  pass?: string;
  snapshotPath?: string; // default: Axis single photo
  streamPath?: string; // default: Axis MJPEG stream (used if the single-photo URL is unavailable)
}

const isJpeg = (b: Uint8Array) => b.length > 2000 && b.length < 3_000_000 && b[0] === 0xff && b[1] === 0xd8;

function find(arr: Uint8Array, a: number, b: number, from = 0) {
  for (let i = from; i < arr.length - 1; i++) if (arr[i] === a && arr[i + 1] === b) return i;
  return -1;
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = process.env.CAM_PROXY_KEY;
  if (!key || req.headers.get('x-cam-key') !== key) return new Response('unauthorized', { status: 401 });

  const { id } = await params;
  let sources: Record<string, Source> = {};
  try {
    sources = JSON.parse(process.env.CAM_SOURCES || '{}');
  } catch {
    return new Response('CAM_SOURCES is not valid JSON', { status: 500 });
  }
  const src = sources[id];
  if (!src?.base) return new Response('unknown camera', { status: 404 });

  const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (compatible; nam-tuam-cam/1.0)' };
  if (src.user) headers.Authorization = `Basic ${Buffer.from(`${src.user}:${src.pass ?? ''}`).toString('base64')}`;
  const base = src.base.replace(/\/$/, '');

  const attempt = async (path: string, stream: boolean) => {
    try {
      const res = await fetch(base + path, { headers, cache: 'no-store', signal: AbortSignal.timeout(9000) });
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
  if (!jpeg || !isJpeg(jpeg)) return new Response('camera did not return a photo', { status: 502 });

  return new Response(Buffer.from(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
}