# Camera Tamper Detection & Notification System

## Table of Contents

- [Overview](#overview)
- [Why Tamper Detection Matters](#why-tamper-detection-matters)
- [System Architecture](#system-architecture)
- [End-to-End Flow](#end-to-end-flow)
- [Tamper Detection Algorithms](#tamper-detection-algorithms)
  - [Covered Camera Detection](#covered-camera-detection)
  - [Blur Detection](#blur-detection)
  - [Moved Camera Detection](#moved-camera-detection)
  - [Overexposure Detection](#overexposure-detection)
- [Consecutive Frame Confirmation & Cooldown](#consecutive-frame-confirmation--cooldown)
- [Alarm Lifecycle](#alarm-lifecycle)
- [Notification System](#notification-system)
  - [In-App Toast Notifications](#in-app-toast-notifications)
  - [Browser Push Notifications](#browser-push-notifications)
  - [Alarm Sound](#alarm-sound)
  - [Device Vibration](#device-vibration)
  - [Notifications Page & Acknowledgment](#notifications-page--acknowledgment)
- [Data Models](#data-models)
- [API Endpoints](#api-endpoints)
- [Realtime Gateway](#realtime-gateway)
- [Docker Architecture](#docker-architecture)
- [Configuration Reference](#configuration-reference)
- [Tuning Guide](#tuning-guide)
- [Run & Troubleshooting](#run--troubleshooting)

---

## Overview

Sentinel VMS includes a dedicated Python/OpenCV sidecar service for real-time
camera tamper detection. The worker continuously monitors enabled cameras by
connecting to their RTSP streams, analyzes frames using four computer-vision
detectors, and — upon confirming a tamper event — persists alarms and
notifications to MongoDB and pushes real-time alerts to all connected browser
clients.

The notification system delivers alerts through four channels entirely
client-side: in-app toast banners, browser push notifications, an audible alarm
siren, and device vibration. There is no email, Firebase/FCM, or server-side
push. All user-facing delivery happens in the browser via Socket.IO.

---

## Why Tamper Detection Matters

In a video management system, the integrity of camera feeds is critical. If a
camera is tampered with — covered, moved, blinded by a flashlight, or rendered
out of focus — the footage becomes unreliable or useless. Without automated
detection, tampering might go unnoticed until someone reviews footage and
discovers it's compromised.

This system addresses the problem by:

1. **Detecting tampering in real-time** (~1 fps analysis) rather than relying on
   manual review.
2. **Confirming via consecutive frames** to avoid false positives from single
   transient glitches.
3. **Immediately notifying operators** through multiple channels so they can
   respond before footage is lost.
4. **Preserving evidence** by saving a JPEG screenshot of the tampered frame for
   later forensic review.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Network                          │
│                                                                 │
│  ┌──────────────┐     RTSP      ┌──────────────┐              │
│  │   MediaMTX   │◄──────────────│  IP Cameras  │              │
│  │  (port 8554) │              └──────────────┘              │
│  └──────┬───────┘                                             │
│         │ RTSP                                                 │
│         ▼                                                      │
│  ┌──────────────────┐  Bearer Token  ┌─────────────────────┐  │
│  │  tamper-detection │───────────────│  Next.js API (app)   │  │
│  │  (Python/OpenCV)  │  GET cameras  │  /api/tamper/cameras │  │
│  │                   │  POST alarm   │  /api/alarms          │  │
│  └──────────────────┘               └──────────┬──────────┘  │
│                                                  │              │
│                                         ┌────────▼────────┐   │
│                                         │     MongoDB      │   │
│                                         │  Alarm + Notif   │   │
│                                         └────────┬────────┘   │
│                                                  │              │
│                                                  ▼              │
│                                         ┌─────────────────┐   │
│                                         │ realtime (Socket.IO)│
│                                         │ /emit/alarm        │   │
│                                         └────────┬────────┘   │
└──────────────────────────────────────────────────┼─────────────┘
                                                    │
                                                    ▼
                                        ┌───────────────────────┐
                                        │   Browser Clients      │
                                        │   ┌─────────────────┐ │
                                        │   │ AlarmNotifier    │ │
                                        │   │ - toast          │ │
                                        │   │ - notification   │ │
                                        │   │ - sound          │ │
                                        │   │ - vibration      │ │
                                        │   └─────────────────┘ │
                                        └───────────────────────┘
```

The system consists of four services:

| Service | Technology | Role |
|---------|-----------|------|
| `tamper-detection` | Python 3, OpenCV, NumPy | Connects to RTSP streams, runs CV detectors, sends alarms |
| `app` (Next.js) | Next.js API routes | Central control plane: camera list, alarm ingestion, notification storage |
| `realtime` | Node.js, Socket.IO | Broadcasts `alarm:created` events to all connected browsers |
| `mediamtx-vms` | MediaMTX | RTSP media server multiplexing camera streams |

---

## End-to-End Flow

### Step 1: Camera List Synchronization

```
MonitorSupervisor.run()  [main.py:34]
  └─► ApiClient.fetch_enabled_cameras()  [api.py:21]
        └─► GET /api/tamper/cameras  [tamper/cameras/route.ts:25]
              └─► MongoDB: Camera.find({ enabled: true })
              └─► Cross-reference with MediaMTX for ready RTSP paths
              └─► Returns [{ id, name, pathName, rtspUrl }]
```

The supervisor polls this endpoint every `TAMPER_CAMERA_POLL_SECONDS` (default
10s). This means if a camera is newly enabled or disabled, the system adapts
within 10 seconds without restarting.

### Step 2: Per-Camera Monitor Threads

```
MonitorSupervisor.sync_monitors()  [main.py:52]
  └─► Creates CameraMonitor + daemon thread per camera  [main.py:70-72]
        └─► Thread name: tamper-{camera.path_name}
```

Each camera gets its own thread with its own RTSP connection, detectors, and
state. This means one camera going offline doesn't affect monitoring of others.

### Step 3: Frame Capture & Analysis (~1 fps)

```
CameraMonitor._read_loop()  [monitor.py:63]
  └─► cv2.VideoCapture(rtspUrl)  [monitor.py:50]
  └─► frame = capture.read()  [monitor.py:66]
  └─► Run ALL four detectors on the frame  [monitor.py:73]:
        ├─► CoveredCameraDetector.analyze(frame)
        ├─► BlurDetector.analyze(frame)
        ├─► MovedCameraDetector.analyze(frame)
        └─► OverexposureDetector.analyze(frame)
  └─► Returns list[Detection] with tamper_type, confidence, metric
```

Multiple detectors can trigger simultaneously (e.g., a camera could be both
moved and overexposed). Each detector runs independently and returns a
`Detection` object if its threshold is exceeded, or `None` if the frame is
normal.

### Step 4: Consecutive Frame Confirmation

```
CameraMonitor._process_detections()  [monitor.py:80]
  └─► Increment consecutive counter per tamper_type  [monitor.py:87]
  └─► Requires `consecutive_frames` (default 4) before confirming  [monitor.py:88]
  └─► Checks cooldown to prevent alarm spam  [monitor.py:90]
  └─► On confirmation: reset counter, set cooldown  [monitor.py:94-96]
```

This is the primary false-positive control. A single dark frame (from auto-
exposure adjustment, for example) won't trigger an alarm. The tamper condition
must persist across 4 consecutive frames (~4 seconds at 1 fps).

### Step 5: Alarm Creation

```
CameraMonitor._confirm_alarm()  [monitor.py:98]
  └─► Save JPEG screenshot to shared volume  [monitor.py:100]
  └─► ApiClient.send_alarm()  [api.py:35]
        └─► POST /api/alarms  [alarms/route.ts:59]
              ├─► Validate Bearer token (ALARM_INGEST_TOKEN)
              ├─► Validate input via Zod schema
              ├─► Create Alarm document in MongoDB
              ├─► Create Notification document in MongoDB
              │     type: "CAMERA_TAMPER"
              │     severity: "CRITICAL" (confidence ≥ 0.9) or "ERROR"
              └─► POST /emit/alarm → Socket.IO broadcast
```

The screenshot is saved to a Docker volume at:
```
/tamper-screenshots/{camera_path_name}/{timestamp}_{type}.jpg
```

If the API call fails (network error, app down), the alarm is queued locally in
the thread's `pending_alarms` list and retried with exponential backoff.

### Step 6: Realtime Broadcast

```
realtime/server.js  [server.js:22]
  └─► POST /emit/alarm
        └─► io.emit("alarm:created", payload)
              └─► All connected Socket.IO clients receive the event
```

### Step 7: Browser Notification Delivery

```
AlarmNotifier component  [alarm-notifier.tsx:112]
  └─► socket.on("alarm:created", ...)
        ├─► Invalidate React Query caches (dashboard, notifications)
        ├─► navigator.vibrate([250, 120, 250])
        ├─► new Notification(title, body)
        ├─► playAlarmSound() — 3-tone siren via Web Audio API
        └─► Show in-app toast for 10 seconds
```

---

## Tamper Detection Algorithms

### Covered Camera Detection

**File:** `tamper-detection/app/detectors.py:24`
**Class:** `CoveredCameraDetector`

**How it works:**
1. Convert the frame to grayscale
2. Calculate the mean pixel brightness (0-255 scale)
3. If brightness falls below `TAMPER_DARK_BRIGHTNESS` (default 35.0), the lens
   is likely covered or obstructed

**Why this works:** When a camera lens is covered by a hand, cloth, or cap, the
resulting image is uniformly dark. The mean brightness drops significantly below
normal indoor/outdoor scenes. A threshold of 35.0 on a 0-255 scale means the
average pixel is less than ~14% bright — near-black.

**Confidence calculation:**
```
confidence = (threshold - brightness) / threshold
```
Darker frames produce higher confidence. A pitch-black frame (brightness = 0)
yields confidence = 1.0.

**Tuning:** Lower the threshold for cameras in naturally dark environments (e.g.,
night-vision cameras, parking garages).

---

### Blur Detection

**File:** `tamper-detection/app/detectors.py:37`
**Class:** `BlurDetector`

**How it works:**
1. Convert the frame to grayscale
2. Compute the Laplacian of the grayscale image using `cv2.Laplacian(gray, CV_64F)`
3. Calculate the variance of the Laplacian
4. If variance falls below `TAMPER_BLUR_LAPLACIAN` (default 55.0), the image
   is considered out of focus or smudged

**Why this works:** The Laplacian operator measures the second derivative of
image intensity — it responds strongly to edges and fine detail. A sharp image
has high Laplacian variance (lots of edges). A blurry image has low variance
(edges are smeared). This is a well-established, computationally cheap focus
metric.

**Confidence calculation:**
```
confidence = (threshold - variance) / threshold
```
Lower variance (more blur) produces higher confidence.

**Tuning:** Cameras with naturally soft focus (low resolution, fog, rain) may
need a lower threshold to avoid false positives.

---

### Moved Camera Detection

**File:** `tamper-detection/app/detectors.py:66`
**Class:** `MovedCameraDetector`

**How it works:**
1. During warmup (first `TAMPER_REFERENCE_WARMUP_FRAMES` = 5 frames):
   - Resize each frame to 320x180 grayscale
   - Apply Gaussian blur (5x5 kernel) to reduce noise
   - Collect samples into a buffer
   - After 5 frames, compute the reference as the pixel-wise mean of all
     samples
2. During monitoring:
   - Prepare the current frame (same resize + blur)
   - Compute `mean absolute difference` between the reference and current frame
   - If difference exceeds `TAMPER_MOVED_DIFF` (default 28.0), the camera has
     been physically moved

**Why this works:** A stationary camera produces frames that are very similar to
the reference. When the camera is physically repositioned, the entire scene
shifts, causing a large pixel-wise difference. The reference is built from an
average of the first 5 frames to create a stable baseline that isn't affected
by minor flicker.

**Why resize to 320x180:** Reduces computation by ~97% (from full HD pixels to
57,600 pixels) while preserving enough spatial detail to detect scene changes.
The Gaussian blur further reduces sensitivity to minor lighting fluctuations.

**Confidence calculation:**
```
confidence = (difference - threshold) / TAMPER_MOVED_CONFIDENCE_SCALE
```
The `scale` factor (default 80.0) controls how quickly confidence ramps up above
the threshold.

**Tuning:** Outdoor cameras with trees/traffic in view may need a higher
threshold. Static indoor cameras can use a lower threshold.

---

### Overexposure Detection

**File:** `tamper-detection/app/detectors.py:50`
**Class:** `OverexposureDetector`

**How it works:**
1. Convert the frame to grayscale
2. Calculate two metrics:
   - **Mean brightness** (0-255 scale)
   - **White-pixel ratio**: fraction of pixels with intensity ≥ 245
3. Trigger if EITHER metric exceeds its threshold:
   - Brightness > `TAMPER_OVEREXPOSED_BRIGHTNESS` (default 230.0)
   - White-pixel ratio > `TAMPER_OVEREXPOSED_PIXEL_RATIO` (default 0.55)

**Why this works:** Deliberate tampering with flashlights, lasers, or bright
lights can saturate the camera sensor, washing out the image. The dual-metric
approach catches both cases:
- A moderate brightness increase across the entire frame (high mean)
- A concentrated bright spot (high white-pixel ratio) even if mean is moderate

**Confidence calculation:**
```
brightness_confidence = (brightness - threshold) / (255 - threshold)
ratio_confidence = (ratio - pixel_threshold) / (1 - pixel_threshold)
final_confidence = max(brightness_confidence, ratio_confidence)
```

**Tuning:** Cameras facing windows or bright light sources may need higher
thresholds.

---

## Consecutive Frame Confirmation & Cooldown

### Consecutive Frames

A single anomalous frame is not enough to trigger an alarm. The system requires
`TAMPER_CONSECUTIVE_FRAMES` (default 4) consecutive frames exhibiting the same
tamper type before confirming. This serves two purposes:

1. **False positive reduction:** Transient glitches (auto-exposure adjustment,
   momentary obstruction, network artifacts) won't trigger alarms.
2. **Statistical confidence:** Sustained detection over multiple frames is
   strongly correlated with real tampering.

The consecutive counter resets to 0 whenever a frame does NOT exhibit the
corresponding tamper type. So a single normal frame in a sequence breaks the
chain.

### Cooldown

After a tamper alarm is confirmed, a cooldown period of
`TAMPER_COOLDOWN_SECONDS` (default 300 seconds / 5 minutes) is activated for
that specific camera + tamper type combination. During the cooldown:

- The detector continues running and counting consecutive frames
- If the tamper condition persists, it will log "alarm is in cooldown" every 30
  seconds
- No new alarm is created until the cooldown expires

This prevents alarm spam. If someone covers a camera and leaves it covered, the
system won't send a new alarm every 4 seconds indefinitely.

---

## Alarm Lifecycle

```
                    ┌───────────────────────────┐
                    │   Frame captured (~1 fps)  │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Run 4 detectors on frame  │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Any detection triggered?  │──── No ──► reset counters
                    └─────────────┬─────────────┘
                                  │ Yes
                    ┌─────────────▼─────────────┐
                    │ Increment consecutive count│
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │ count >= consecutive_frames?│──── No ──► wait next frame
                    └─────────────┬─────────────┘
                                  │ Yes
                    ┌─────────────▼─────────────┐
                    │  In cooldown for this type? │──── Yes ──► log, wait
                    └─────────────┬─────────────┘
                                  │ No
                    ┌─────────────▼─────────────┐
                    │     CONFIRM ALARM          │
                    │  - Save JPEG screenshot    │
                    │  - POST /api/alarms        │
                    │  - Create Alarm + Notif    │
                    │  - Socket.IO broadcast     │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Reset counter, set        │
                    │  cooldown timer            │
                    └───────────────────────────┘
```

### Retry Logic

If the `POST /api/alarms` call fails (Next.js app is down, network error), the
alarm is queued in `pending_alarms` on the camera's monitor thread. The retry
schedule uses exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 15 seconds |
| 2 | 30 seconds |
| 3 | 60 seconds |
| 4 | 120 seconds |
| 5 | 240 seconds |
| 6+ | 300 seconds (capped) |

Retries happen at the start of each frame read cycle, so they interleave with
normal monitoring. If the app comes back online, the queued alarm is delivered
on the next retry attempt.

---

## Notification System

### In-App Toast Notifications

**File:** `src/components/alarm-notifier.tsx:103`

When an `alarm:created` Socket.IO event arrives, the `AlarmNotifier` component
immediately displays a red-styled toast card in the top-right corner of the
browser. The toast contains:

- **Title:** "{Camera Name} tamper alarm"
- **Message:** "{TYPE} detected · {confidence}% confidence"
- A "Dismiss" button (X icon)

Toasts auto-dismiss after 10 seconds. Up to 4 toasts can be visible
simultaneously (oldest is removed when a 5th arrives).

The `AlarmNotifier` component is mounted globally via the `Providers` component
(`src/components/providers.tsx:8`), so it works regardless of which page the
user is viewing.

### Browser Push Notifications

**File:** `src/components/alarm-notifier.tsx:49-57`

Uses the Web Notifications API (`new Notification()`). This only fires if the
user has previously granted notification permission. If permission hasn't been
requested yet, the toast shows an "Enable browser alerts" button that triggers
`Notification.requestPermission()`.

Browser notifications appear as OS-level popups, meaning the user sees them
even when the browser tab is not focused. On mobile, these integrate with the
notification shade.

### Alarm Sound

**File:** `src/components/alarm-notifier.tsx:71-101`

A 3-tone siren is played via the Web Audio API:
- 880 Hz for 180ms
- 660 Hz for 180ms
- 880 Hz for 180ms

Each tone ramps up quickly (20ms attack) and fades out (950ms decay). The tones
are connected through a shared gain node for consistent volume.

Browsers block audio autoplay until the user interacts with the page. If autoplay
is blocked, the toast shows an "Enable alarm sound" button. Clicking it resumes
the `AudioContext` and plays the sound.

### Device Vibration

**File:** `src/components/alarm-notifier.tsx:44-47`

On mobile devices that support the Vibration API, the alarm triggers a
vibration pattern: 250ms vibrate → 120ms pause → 250ms vibrate. This provides
a haptic alert even if the user isn't looking at the screen.

### Notifications Page & Acknowledgment

**File:** `src/features/notifications/notifications-view.tsx:13`

The `/notifications` page displays a list of all notifications (last 100) from
the `Notification` collection. Each notification shows:

- **Severity badge:** color-coded (green for INFO, yellow for WARNING, red for
  ERROR/CRITICAL)
- **Title and message** (e.g., "Front Camera tamper detected" / "covered tamper
  detected with 92% confidence")
- **Timestamp**
- **Acknowledge button** (checkmark icon) — marks the notification as read

Acknowledged notifications remain in the list but appear with reduced opacity.
The page polls every 5 seconds for updates.

---

## Data Models

### Alarm

```typescript
{
  cameraId:     ObjectId → Camera (required, indexed)
  type:         "COVERED" | "BLURRED" | "MOVED" | "OVEREXPOSED" (required, indexed)
  confidence:   Number 0–1 (required)
  screenshotPath: String (required)        // path to saved JPEG
  detectedAt:   Date (required, indexed)
  acknowledged: Boolean (default: false, indexed)
  createdAt:    Date (auto)
  updatedAt:    Date (auto)
}
// Compound index: { cameraId: 1, detectedAt: -1 }
```

### Notification

```typescript
{
  type:         "CAMERA_OFFLINE" | "CAMERA_ONLINE" | "RECORDING_STARTED" |
                "RECORDING_STOPPED" | "STORAGE_LOW" | "MEDIAMTX_ERROR" |
                "CAMERA_TAMPER" (required)
  severity:     "INFO" | "WARNING" | "ERROR" | "CRITICAL" (default: "INFO")
  title:        String (required)
  message:      String (required)
  cameraId:     ObjectId → Camera (default: null, indexed)
  acknowledged: Boolean (default: false, indexed)
  createdAt:    Date (auto)
  updatedAt:    Date (auto)
}
// Compound index: { acknowledged: 1, createdAt: -1 }
```

For tamper alarms, `type` is always `"CAMERA_TAMPER"` and `severity` is
determined by confidence:
- Confidence ≥ 0.9 → `"CRITICAL"`
- Confidence < 0.9 → `"ERROR"`

---

## API Endpoints

### Worker Camera List

```http
GET /api/tamper/cameras
Authorization: Bearer <ALARM_INGEST_TOKEN>
```

Returns all enabled cameras with ready RTSP paths from MediaMTX. Used by the
Python worker to know which cameras to monitor.

### Alarm Ingest

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

**Response (201):**
```json
{
  "id": "...",
  "cameraId": { "id": "...", "name": "Front Camera", "pathName": "cam1" },
  "type": "COVERED",
  "confidence": 0.92,
  "screenshotPath": "/tamper-screenshots/cam1/20260619T080000000000Z_covered.jpg",
  "detectedAt": "2026-06-19T08:00:00.000Z",
  "acknowledged": false
}
```

Creates both an `Alarm` and a `Notification` document, then emits a Socket.IO
event.

### Alarm Listing

```http
GET /api/alarms
```

Returns the last 100 alarms sorted by `detectedAt` descending, with camera
details populated. Requires `cameras:view` permission.

### Notification Listing

```http
GET /api/notifications
```

Returns the last 100 notifications sorted by `createdAt` descending. Requires
authentication.

### Notification Acknowledgment

```http
PATCH /api/notifications
Content-Type: application/json
```

```json
{ "id": "notification-object-id" }
```

Marks a notification as acknowledged.

---

## Realtime Gateway

**File:** `realtime/server.js`

A lightweight Express + Socket.IO server that bridges the Next.js API and
browser clients.

```
POST /emit/alarm  →  io.emit("alarm:created", payload)
GET  /health      →  { ok: true, clients: N }
```

The Next.js API calls `POST /emit/alarm` internally (server-to-server) after
creating the alarm. The Socket.IO server broadcasts the event to all connected
browser clients. There is no authentication on the internal endpoint — it's
only accessible within the Docker network.

---

## Docker Architecture

The `tamper-detection` service in `docker-compose.yml`:

```yaml
tamper-detection:
  build:
    context: ./tamper-detection
    dockerfile: Dockerfile
  restart: unless-stopped
  depends_on:
    - app
    - mediamtx-vms
  environment:
    APP_BASE_URL: http://app:3000
    TAMPER_RTSP_BASE_URL: rtsp://mediamtx-vms:8554
    REALTIME_INTERNAL_URL: http://realtime:3001
    TAMPER_SCREENSHOT_DIR: /tamper-screenshots
    ALARM_INGEST_TOKEN: ${ALARM_INGEST_TOKEN}
  volumes:
    - tamper_screenshots:/tamper-screenshots
```

- **`restart: unless-stopped`** — the worker auto-restarts on crash
- **Depends on `app` and `mediamtx-vms`** — ensures the API and RTSP server are
  available
- **Shared volume `tamper_screenshots`** — makes screenshots accessible to the
  Next.js app for serving

In development, `docker-compose.yml` overrides some defaults:
- `TAMPER_CONSECUTIVE_FRAMES=1` (faster alarm triggering for testing)
- `TAMPER_COOLDOWN_SECONDS=30` (shorter cooldown for testing)

---

## Configuration Reference

### Python Worker Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALARM_INGEST_TOKEN` | *required* | Bearer token for API authentication |
| `APP_BASE_URL` | `http://localhost:3000` | Next.js app base URL |
| `TAMPER_RTSP_BASE_URL` | `rtsp://localhost:8554` | RTSP base URL for camera streams |
| `TAMPER_SCREENSHOT_DIR` | `/tamper-screenshots` | Directory to save alarm screenshots |
| `TAMPER_CAMERA_POLL_SECONDS` | `10` | How often to re-sync camera list |
| `TAMPER_FRAME_INTERVAL_SECONDS` | `1.0` | Delay between frame captures (~1 fps) |
| `TAMPER_CONSECUTIVE_FRAMES` | `4` | Frames needed to confirm an alarm |
| `TAMPER_COOLDOWN_SECONDS` | `300` | Cooldown between repeated alarms per camera+type |
| `TAMPER_CONNECT_RETRY_SECONDS` | `5` | Retry delay on RTSP connection failure |
| `TAMPER_DARK_BRIGHTNESS` | `35.0` | Covered-camera brightness threshold |
| `TAMPER_BLUR_LAPLACIAN` | `55.0` | Blur detection Laplacian variance threshold |
| `TAMPER_MOVED_DIFF` | `28.0` | Camera moved mean-difference threshold |
| `TAMPER_MOVED_CONFIDENCE_SCALE` | `80.0` | Scale factor for moved-confidence calculation |
| `TAMPER_MOVED_WARMUP_FRAMES` | `5` | Frames to collect before building reference |
| `TAMPER_OVEREXPOSED_BRIGHTNESS` | `230.0` | Overexposure brightness threshold |
| `TAMPER_OVEREXPOSED_PIXEL_RATIO` | `0.55` | Overexposure white-pixel ratio threshold |
| `REALTIME_INTERNAL_URL` | `http://localhost:3001` | Socket.IO gateway URL |

### Next.js Server Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALARM_INGEST_TOKEN` | *optional* | Shared secret for worker auth (min 24 chars) |
| `TAMPER_RTSP_BASE_URL` | `rtsp://localhost:8554` | RTSP base URL |
| `REALTIME_INTERNAL_URL` | `http://localhost:3001` | Internal URL for Socket.IO emit |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:3001` | Public Socket.IO URL (used by browser) |

---

## Tuning Guide

### Covered Camera Threshold

| Environment | Recommended `TAMPER_DARK_BRIGHTNESS` |
|-------------|--------------------------------------|
| Well-lit office | 30–40 (default 35) |
| Night-vision / IR camera | 10–15 |
| Outdoor with shadows | 20–30 |
| Pitch-black room (normal) | Disable or set to 5 |

### Blur Threshold

| Environment | Recommended `TAMPER_BLUR_LAPLACIAN` |
|-------------|--------------------------------------|
| Sharp HD camera | 50–60 (default 55) |
| Lower resolution camera | 30–40 |
| Camera with rain/fog | 20–30 |

### Moved Camera Threshold

| Environment | Recommended `TAMPER_MOVED_DIFF` |
|-------------|--------------------------------------|
| Static indoor camera | 20–25 |
| Outdoor with trees/traffic | 35–45 |
| Camera on vibrating mount | 40–50 |

### Consecutive Frames & Cooldown

| Scenario | `TAMPER_CONSECUTIVE_FRAMES` | `TAMPER_COOLDOWN_SECONDS` |
|----------|----------------------------|--------------------------|
| Production | 4 | 300 (5 min) |
| Development/testing | 1 | 30 |
| High-security area | 6–8 | 600 (10 min) |
| Low-light environment | 3 | 300 |

---

## Run & Troubleshooting

### Start the System

```bash
docker compose up -d --build realtime tamper-detection
```

### View Logs

```bash
docker compose logs -f tamper-detection realtime
```

### Key Log Messages

| Message | Meaning |
|---------|---------|
| `Starting tamper monitor for {name} ({rtsp_url})` | Camera monitoring started |
| `Could not open RTSP stream for {path}` | RTSP connection failed, retrying in 5s |
| `Lost RTSP frame for {path}; reconnecting` | Stream dropped, reconnecting |
| `Tamper confirmed camera={path} type={type} confidence={n}` | Alarm confirmed and sent |
| `Failed to send tamper alarm for {path}` | API call failed, will retry with backoff |
| `Tamper still detected ... but alarm is in cooldown` | Tamper persists but cooldown is active |

### Common Issues

**No alarms appearing:**
- Check that `ALARM_INGEST_TOKEN` is set and matches between Python worker and
  Next.js
- Verify the Next.js app is accessible from the worker container
- Check `docker compose logs app` for API errors

**RTSP connection failures:**
- Verify MediaMTX is running: `docker compose logs mediamtx-vms`
- Check that cameras are configured with correct source URLs
- Ensure `TAMPER_RTSP_BASE_URL` points to the correct MediaMTX container

**No sound/toast in browser:**
- Browser autoplay may be blocking audio — click "Enable alarm sound"
- Notification permission may not be granted — click "Enable browser alerts"
- Check that `NEXT_PUBLIC_SOCKET_URL` matches the realtime server address
- Verify Socket.IO connection in browser DevTools (Network tab)

### Screenshots

Screenshots are stored in the Docker volume `tamper_screenshots` at:
```
/tamper-screenshots/{camera_path_name}/{timestamp}_{type}.jpg
```

To view screenshots from the host:
```bash
docker compose exec tamper-detection ls /tamper-screenshots/
```
