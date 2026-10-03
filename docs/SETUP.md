# ระดับน้ำสมุทรสงคราม: setup and operations notes

## How it fits together
```
Cloudflare Worker (cron, every 15 min)
  ├─ fetches ThaiWater / tide data  ->  Upstash Redis (current data)
  └─ GET /api/cron/snapshot (Bearer CRON_SECRET)
        └─ reads /api/water-data, pushes a compact snapshot onto Redis list `flood:history` (keeps 100)

Next.js on Vercel
  ├─ /api/water-data        current stations + tides (existing)
  ├─ /api/history           last 24 h of snapshots, oldest first (CDN-cached 2 min)
  └─ /api/cron/snapshot     protected, called by the Worker only
```

## Environment variables
| Where | Name | Purpose |
|---|---|---|
| Vercel | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis access (already set) |
| Vercel | `CRON_SECRET` | Long random string; the snapshot route rejects calls without it |
| Worker | `SITE_URL` | e.g. `https://nam-tuam.vercel.app` |
| Worker | `CRON_SECRET` | Same value as on Vercel |

Worker, at the end of the scheduled handler:
```js
ctx.waitUntil(fetch(`${env.SITE_URL}/api/cron/snapshot`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }));
```

## Quick health checks
- `/api/history` -> `{"snapshots":[...]}`; the count should grow by 1 every 15 minutes (cached up to 2 min).
- Manual snapshot: `curl.exe -H "Authorization: Bearer <secret>" https://<site>/api/cron/snapshot` -> `{"ok":true,...}`.
- The slider bar needs 2 snapshots; a full 24 h takes a day to fill.

## Things worth knowing
- **Station data shape** the UI relies on: `id, name, lat, lng, waterLevel, bankHeight, capacityPercent, status, trend, updatedAt`. A station not updated for 3 h is treated as "no data".
- **3D map** loads MapLibre from the jsdelivr CDN at runtime (Next.js/Turbopack breaks its web worker when bundled). The npm package is only used for types and CSS. Basemap tiles come from OpenFreeMap; 2D uses CARTO.
- **If 3D shows blank**: open DevTools console and look for `[Map3D]` messages. WebGL or CDN failures drop the user back to 2D automatically.
- **Share links**: `?station=<id>` opens a station; `?view=3d` opens the 3D map.
- **Weak phones** start with 3D buildings off (dock button turns them on) and a capped render resolution.
- **Install as an app**: the site ships a web app manifest and icons, so phones offer "Add to Home Screen".

## Ideas not built yet
- Backfill history from the government API so the slider works on day one.
- Notifications (LINE Notify alternative / web push) when a station turns critical.
- More stations or districts, once the data source provides them.