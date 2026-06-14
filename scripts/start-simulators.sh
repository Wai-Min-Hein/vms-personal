#!/bin/sh
set -eu

for input in "public/videos/video.mp4" "public/videos/output.mp4"; do
  if [ ! -f "$input" ]; then
    echo "Simulator video not found: $input"
    exit 1
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Required command not found: docker"
  exit 1
fi

if command -v pgrep >/dev/null 2>&1; then
  legacy_launchers=$(pgrep -f "sh scripts/start-simulators.sh" 2>/dev/null || true)
  for pid in $legacy_launchers; do
    if [ "$pid" != "$$" ] && [ "$pid" != "$PPID" ]; then
      echo "Stopping legacy simulator launcher: $pid"
      kill "$pid" 2>/dev/null || true
    fi
  done

  legacy_publishers=$(pgrep -f "ffmpeg.*rtsp://localhost:18554/vcam[12]" 2>/dev/null || true)
  if [ -n "$legacy_publishers" ]; then
    echo "Stopping legacy host FFmpeg publishers: $legacy_publishers"
    kill $legacy_publishers 2>/dev/null || true
  fi
  sleep 1
fi

echo "Starting the simulator, VMS, and two Docker-managed FFmpeg publishers..."
docker compose up -d --build \
  mediamtx-simulator \
  simulator-vcam1 \
  simulator-vcam2 \
  mediamtx-vms

echo "Simulator streams are running in Docker:"
echo "  vcam1 -> rtsp://localhost:18554/vcam1"
echo "  vcam2 -> rtsp://localhost:18554/vcam2"
echo "  VMS API -> http://localhost:9997"
echo
echo "View status with: docker compose ps"
echo "Stop them with:  pnpm run simulators:stop"
