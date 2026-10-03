# ระดับน้ำสมุทรสงคราม: setup and operations notes

## How it fits together
```
Cloudflare Worker (cron, every 15 min; edited in the Cloudflare dashboard)
  └─ one Upstash pipeline per run:
       SET samutsongkhram:water_levels / tides / last_updated     (current data)
       LPUSH flood:history <snapshot>  +  LTRIM flood:history 0 99 (24 h of history, ~96 entries)

Next.js on Vercel
  ├─ /api/water-data   current stations + tides
  └─ /api/history      last 24 h of snapshots, oldest first (CDN-cached 2 min)
```
Snapshot format: `{ "t": <epoch ms>, "d": { "<stationId>": [level, capacity%, status 0/1/2, trend -1/0/1] } }`
(the same shape `lib/history.ts` reads).

## Environment variables
| Where | Name | Purpose |
|---|---|---|
| Vercel | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis access |
| Worker | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis access |
| Worker | `THAIWATER_API_KEY` | only needed if the data source you end up using requires it |

## Quick health checks
- Worker URL with `?record=1` appended records one history snapshot on demand (the cron records automatically).
- `/api/history` -> `{"snapshots":[...]}`; the count grows by 1 every 15 minutes (cached up to 2 min).
- The slider bar needs 2 snapshots; a full 24 h takes a day to fill.

## Things worth knowing
- **Station data shape** the UI relies on: `id, name, lat, lng, waterLevel, bankHeight, capacityPercent, status, trend, updatedAt`. A station not updated for 3 h is treated as "no data".
- **3D map** loads MapLibre from the jsdelivr CDN at runtime (Next.js/Turbopack breaks its web worker when bundled). The npm package is only used for types and CSS. Basemap tiles come from OpenFreeMap; 2D uses CARTO.
- **If 3D shows blank**: open DevTools console and look for `[Map3D]` messages. WebGL or CDN failures drop the user back to 2D automatically.
- **Share links**: `?station=<id>` opens a station; `?view=3d` opens the 3D map.
- **Weak phones** start with 3D buildings off (dock button turns them on) and a capped render resolution.
- **Test data:** while the government API is unavailable the Worker serves fallback stations (with a small made-up drift so the slider has something to show). Remove the drift block once real data flows.
- **Install as an app**: the site ships a web app manifest and icons, so phones offer "Add to Home Screen".

## Ideas not built yet
- Backfill history from the government API so the slider works on day one.
- Notifications (LINE Notify alternative / web push) when a station turns critical.
- More stations or districts, once the data source provides them.