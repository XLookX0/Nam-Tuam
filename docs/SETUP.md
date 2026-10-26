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


## Cameras on a home network (Yoosee and similar): push mode
A home camera has no public address, so the Worker can't download from it. Instead a small script on a computer on the same
network grabs one frame from the camera and uploads it to the Worker.
1. In the Yoosee app set a camera password. The camera's RTSP address is normally `rtsp://admin:<password>@<camera-ip>:554/onvif1`
   (`/onvif2` is the lighter preview stream; a few models use `/11`). Test it first in VLC: Media -> Open Network Stream.
   Give the camera a fixed IP (router: DHCP reservation), because the address can change.
2. Worker secrets: add `UPLOAD_KEY` (any long random string you invent) and put the camera in `CAMERAS` as `{"id":"cam-01","push":true}` (no url).
3. On the always-on computer: install ffmpeg, copy `tools/push-camera.ps1` (Windows) or `tools/push-camera.sh` (Linux, Mac, Raspberry Pi),
   fill in the four values at the top, and run it every 3 minutes (the first lines of each script show how).
4. Test: run the script once by hand. It should print `{"ok":true,...}`. Then check `/api/cameras`.
Never forward the camera's port to the internet. The script only needs an outgoing connection.
To try the website with no camera at all, set a pull camera such as `{"id":"cam-01","url":"https://picsum.photos/1280/720.jpg"}` (a random photo each time).


## Cameras without R2 (free), and the DWR cameras
**Storage.** R2 asks for a payment method. Workers KV does not need one (it is part of the free Workers plan, as far as I know).
Bind a KV namespace to the Worker as `CAM_KV` (Workers & Pages -> KV -> create namespace; then Worker -> Settings -> Bindings -> KV namespace).
The Worker uses R2 only if `CAM_BUCKET` is also bound. Free KV allows 1,000 writes a day, 100,000 reads a day and 1 GB,
so with KV the Worker takes a photo every 6 minutes (240 a day per camera, fine for up to 4 cameras). Change it with `CAM_EVERY_MIN` (a multiple of 3).
Frames delete themselves after 3 days (KV expiry).

**DWR Axis cameras (http, port 5001, user name and password).** Cloudflare Workers can't put a password inside a URL and may ignore custom ports,
so the website itself (Vercel) fetches the photo: `app/api/cam-source/[id]/route.ts`.
Vercel environment variables:
- `CAM_PROXY_KEY` = a long random string you invent
- `CAM_SOURCES` = `{"dwr-ta130202":{"base":"http://ta130202.dyndns.info:5001","user":"live","pass":"<password from the DWR page>"},"dwr-ta130203":{"base":"http://<host>:<port>","user":"live","pass":"<password>"}}`
Worker secret `CAMERAS`:
`[{"id":"dwr-ta130202","url":"https://<your-site>.vercel.app/api/cam-source/dwr-ta130202","headers":{"x-cam-key":"<same as CAM_PROXY_KEY>"}}, ...]`
The route asks the camera for a single photo (`/axis-cgi/jpg/image.cgi`) and, if that is not available, cuts the first frame out of the MJPEG stream (`/axis-cgi/mjpg/video.cgi`).
Please check DWR's terms (or ask mekhala@dwr.mail.go.th) before showing and archiving their pictures publicly, and keep the credit on the cards.


## Simplest camera setup: live photo only (no Cloudflare, no storage, no keys)
For a camera that is reachable over the internet with a user name and password (like the DWR Axis cameras), mark it `live: true`
in `lib/cameras.ts`. The website then shows the camera's current photo (refreshed every 30-60 s) through `/api/cam-source/<id>`,
which logs in to the camera (Basic or Digest) and returns the picture over HTTPS. Nothing to set up in Cloudflare or Vercel:
the first DWR camera (`dwr-ta130202`) is built into the route. More cameras: Vercel variable `CAM_SOURCES`
(`{"dwr-ta130203":{"base":"http://host:port","user":"live","pass":"..."}}`).
What you give up: the saved 3-day history, scrubber, timelapse and compare view. To get those later, remove `live: true`
and follow "Cameras without R2" above (the Worker then downloads the same route every 6 minutes and stores the photos in KV).
Test: open `https://<your-site>/api/cam-source/dwr-ta130202` in a browser. You should see the Tha Chalom gauge photo.