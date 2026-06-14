#!/bin/sh
set -eu

INPUT="${1:-public/videos/video.mp4}"
PATH_NAME="${2:-vcam1}"

if [ -f "$INPUT" ]; then
  ffmpeg -hide_banner -loglevel warning -re -stream_loop -1 \
    -i "$INPUT" \
    -map 0:v:0 -map 0:a:0? \
    -c:v libx264 -preset veryfast -tune zerolatency \
    -profile:v main -pix_fmt yuv420p -g 48 -keyint_min 48 -bf 0 \
    -c:a aac -ac 2 -ar 48000 \
    -f rtsp -rtsp_transport tcp \
    "rtsp://localhost:18554/$PATH_NAME"
else
  ffmpeg -hide_banner -loglevel warning -re -f lavfi -i "$INPUT" \
    -f lavfi -i "sine=frequency=1000:sample_rate=48000" \
    -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
    -c:a aac -f rtsp -rtsp_transport tcp \
    "rtsp://localhost:18554/$PATH_NAME"
fi
