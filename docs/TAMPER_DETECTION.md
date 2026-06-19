# Camera Tamper Detection

Sentinel VMS includes a Python/OpenCV worker for low-CPU camera tamper detection.
The worker reads enabled cameras through the Next.js API, connects to the VMS
MediaMTX RTSP paths, samples about one frame per second, and sends confirmed
alarms back to the app.

## Flow

```text
MongoDB Camera.enabled
  -> GET /api/tamper/cameras
  -> Python tamper worker
  -> RTSP from MediaMTX VMS
  -> OpenCV frame analysis
  -> screenshot saved to tamper_screenshots volume
  -> POST /api/alarms
  -> MongoDB Alarm + Notification
  -> realtime Socket.IO alarm:created event
  -> Dashboard refresh
```

## Detection Types

| Type | Method | Reason |
| --- | --- | --- |
| `COVERED` | Average grayscale brightness below threshold | Covered lenses usually become very dark. |
| `BLURRED` | Low OpenCV Laplacian variance | Laplacian variance is a cheap focus/blur metric. |
| `MOVED` | Mean frame difference from reference frame | Large scene changes indicate a camera angle shift. |
| `OVEREXPOSED` | High brightness or high white-pixel ratio | Flashlights or strong light can saturate the frame. |

## False Positive Controls

- Frames are sampled at roughly one frame per second to reduce CPU usage.
- A tamper condition must occur for `TAMPER_CONSECUTIVE_FRAMES` frames before an alarm is confirmed.
- `TAMPER_COOLDOWN_SECONDS` prevents repeated alarms for the same camera and tamper type.
- The moved-camera detector waits for `TAMPER_REFERENCE_WARMUP_FRAMES` frames before creating its reference frame.

## Environment

```env
ALARM_INGEST_TOKEN="replace-with-at-least-24-random-characters"
TAMPER_RTSP_BASE_URL="rtsp://localhost:8554"
REALTIME_INTERNAL_URL="http://localhost:3001"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
```

Docker Compose sets service-internal URLs automatically:

```text
APP_BASE_URL=http://app:3000
TAMPER_RTSP_BASE_URL=rtsp://mediamtx-vms:8554
REALTIME_INTERNAL_URL=http://realtime:3001
```

## Tuning

```env
TAMPER_CAMERA_POLL_SECONDS=10
TAMPER_FRAME_INTERVAL_SECONDS=1
TAMPER_CONSECUTIVE_FRAMES=4
TAMPER_COOLDOWN_SECONDS=300
TAMPER_DARK_BRIGHTNESS=35
TAMPER_BLUR_LAPLACIAN=55
TAMPER_MOVED_DIFF=28
TAMPER_OVEREXPOSED_BRIGHTNESS=230
TAMPER_OVEREXPOSED_PIXEL_RATIO=0.55
```

Tune thresholds per camera environment. Low-light rooms usually need a lower
covered-camera threshold. Static indoor cameras can use a lower moved-camera
threshold than outdoor cameras.

## Run

```bash
docker compose up -d --build realtime tamper-detection
```

View logs:

```bash
docker compose logs -f tamper-detection realtime
```

Screenshots are stored in the Docker volume:

```text
tamper_screenshots:/tamper-screenshots
```

## API

Worker camera list:

```http
GET /api/tamper/cameras
Authorization: Bearer <ALARM_INGEST_TOKEN>
```

Alarm ingest:

```http
POST /api/alarms
Authorization: Bearer <ALARM_INGEST_TOKEN>
Content-Type: application/json
```

```json
{
  "cameraId": "camera-object-id",
  "type": "COVERED",
  "confidence": 0.92,
  "screenshotPath": "/tamper-screenshots/cam1/20260619T080000000000Z_covered.jpg",
  "timestamp": "2026-06-19T08:00:00.000Z"
}
```

Dashboard reads recent alarms through:

```http
GET /api/dashboard
GET /api/alarms
```

Socket.IO event:

```text
alarm:created
```
