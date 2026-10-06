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
- Worker URL with `?backfill=1` rebuilds the last 24 h of history from the simulation in one go (refused when real data is flowing).
- `/api/history` -> `{"snapshots":[...]}`; the count grows by 1 every 15 minutes (cached up to 2 min).
- The slider bar needs 2 snapshots; a full 24 h takes a day to fill.

## Things worth knowing
- **Station data shape** the UI relies on: `id, name, lat, lng, waterLevel, bankHeight, capacityPercent, status, trend, updatedAt`. A station not updated for 3 h is treated as "no data".
- **3D map** loads MapLibre from the jsdelivr CDN at runtime (Next.js/Turbopack breaks its web worker when bundled). The npm package is only used for types and CSS. Basemap tiles come from OpenFreeMap; 2D uses CARTO.
- **If 3D shows blank**: open DevTools console and look for `[Map3D]` messages. WebGL or CDN failures drop the user back to 2D automatically.
- **Share links**: `?station=<id>` opens a station; `?view=3d` opens the 3D map.
- **Weak phones** start with 3D buildings off (dock button turns them on) and a capped render resolution.
- **Simulated data:** while the government API is unavailable the Worker serves 9 stations in Mueang, Amphawa and Bang Khonthi (approximate coordinates) whose levels follow a harmonic tide model with per-station lag and strength; tides on the dashboard come from the same model. Tune `SURGE_M` in `worker.js` for calmer or more dramatic data. Station 9 is offline on purpose to show the "ไม่ส่งค่า" state (remove `offlineHours` to bring it online). When live data works, the Worker uses it automatically; the tide model stays until a tide source is added.
- **Install as an app**: the site ships a web app manifest and icons, so phones offer "Add to Home Screen".

## Ideas not built yet
- Backfill history from the government API so the slider works on day one.
- Notifications (LINE Notify alternative / web push) when a station turns critical.
- More stations or districts, once the data source provides them.


## Cameras (CCTV)
How it works: every 3 minutes the Worker downloads one JPEG from each camera's snapshot URL, saves it in Cloudflare R2
(`cam/<id>/<epoch>.jpg`) and indexes it in Redis (`cam:<id>:frames`, a sorted set). Frames older than 3 days are deleted
once an hour. The Worker also serves frames at `/cam/<id>/<epoch>.jpg` (cached for a year, a frame never changes).
The website reads the index through `/api/cameras` and `/api/cameras/<id>/frames`.

Setup:
1. Cloudflare dashboard -> R2 -> create a bucket (e.g. `nam-tuam-cams`).
2. Worker -> Settings -> Bindings -> add an R2 bucket binding named `CAM_BUCKET`.
3. Worker -> Settings -> Variables: add a secret `CAMERAS`, JSON such as
   `[{"id":"cam-01","url":"https://your-camera/snapshot.jpg"},{"id":"cam-02","url":"..."}]`
   (optional per camera: `"headers": {"Authorization": "Basic ..."}`). Add a secret `ADMIN_KEY` (any long random string) for manual tests.
4. Worker -> Settings -> Trigger events: add cron `*/3 * * * *` and DELETE the old `*/15 * * * *` one
   (the Worker runs the water sync every 15 minutes by itself).
5. Vercel -> Environment Variables: `NEXT_PUBLIC_CAM_BASE` = your Worker URL (no trailing slash), then redeploy.
6. Edit `lib/cameras.ts`: names, positions, nearest station, credit. The `id`s must match the Worker's `CAMERAS`.

Tests:
- `https://<worker>/?capture=1&key=<ADMIN_KEY>` takes one photo per camera now and reports `ok` or the error per camera.
- `/api/cameras` shows `latestTs` and `count` per camera.

Free-tier budget (3 cameras, one frame every 3 minutes): about 43k Redis commands a month (free plan: 500k),
about 43k R2 writes (free: 1M) and roughly 350 MB stored for 3 days if each photo is about 80 KB (free: 10 GB).
Camera URLs are secrets: they live only in the Worker variable, never in the website code.


## Live water data (ThaiWater HII + RID SWOC)
- The Worker merges two public sources; if both fail it falls back to the simulation (`source: SIMULATED` in the Worker's reply).
- **Status** comes from freeboard (metres left below the bank top): 0.5 m or less = warning, 0.2 m or less = critical.
- **The percentage** is derived from the same freeboard (`fillPct`, in both `worker.js` and `lib/station.ts`): 0.5 m left = 70%, 0.2 m = 90%, at the bank = 100%.
  Plain level / bank height breaks for gauges measured from a different datum (e.g. level 14.36 m, bank 15.5 m, which used to read 92%).
- Stations without a real bank height are skipped, because a made-up default would give false alarms.
- The sources report one reading and no trend, so the website works out rising / falling from the last hour of saved history.
- If you change the thresholds, change them in `statusFor` and `fillPct` together.