#!/bin/sh

set -u

child_pid=""

stop() {
  if [ -n "$child_pid" ]; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  exit 0
}

trap stop INT TERM

while true; do
  ffmpeg "$@" &
  child_pid=$!
  wait "$child_pid"
  status=$?
  child_pid=""
  echo "FFmpeg publisher exited with status $status; retrying in 2 seconds." >&2
  sleep 2
done