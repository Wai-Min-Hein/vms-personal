"use client";

import { Camera, FastForward, Pause, Play, Rewind } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export interface PlaybackSegment {
  start: string;
  duration?: number | null;
  url?: string;
  active?: boolean;
}

export function NormalizedRecordingPlayer({
  segment,
  snapshotName = "recording"
}: {
  segment: PlaybackSegment | null;
  snapshotName?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const mediaOffset = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const segmentDuration =
    typeof segment?.duration === "number" && Number.isFinite(segment.duration)
      ? segment.duration
      : 0;

  useEffect(() => {
    const player = video.current;
    if (!player || !segment?.url) return;

    mediaOffset.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    player.load();
    void player.play().catch(() => undefined);
  }, [segment?.url]);

  function formatTime(seconds: number) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
  }

  function initializeTimeline() {
    const player = video.current;
    if (!player || !segmentDuration || !Number.isFinite(player.duration)) return;

    mediaOffset.current = Math.max(0, player.duration - segmentDuration);
    if (player.currentTime < mediaOffset.current) {
      player.currentTime = mediaOffset.current;
    }
    setCurrentTime(Math.max(0, player.currentTime - mediaOffset.current));
  }

  function seek(normalizedTime: number) {
    const player = video.current;
    if (!player) return;
    const nextTime = Math.min(segmentDuration, Math.max(0, normalizedTime));
    player.currentTime = mediaOffset.current + nextTime;
    setCurrentTime(nextTime);
  }

  function togglePlayback() {
    const player = video.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    if (segmentDuration && currentTime >= segmentDuration) seek(0);
    void player.play().catch(() => undefined);
  }

  function snapshot() {
    const player = video.current;
    if (!player) return;
    const canvas = document.createElement("canvas");
    canvas.width = player.videoWidth;
    canvas.height = player.videoHeight;
    canvas.getContext("2d")?.drawImage(player, 0, 0);
    const link = document.createElement("a");
    link.download = `${snapshotName}-${Date.now()}.jpg`;
    link.href = canvas.toDataURL("image/jpeg");
    link.click();
  }

  return (
    <>
      <div className="aspect-video overflow-hidden rounded-lg bg-black">
        <video
          ref={video}
          className="h-full w-full"
          src={segment?.url}
          playsInline
          preload="metadata"
          onLoadedMetadata={initializeTimeline}
          onDurationChange={initializeTimeline}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(segmentDuration);
          }}
          onTimeUpdate={(event) => {
            const normalizedTime = Math.max(
              0,
              event.currentTarget.currentTime - mediaOffset.current
            );
            if (segmentDuration && normalizedTime >= segmentDuration) {
              event.currentTarget.pause();
              seek(segmentDuration);
              return;
            }
            setCurrentTime(Math.min(segmentDuration, normalizedTime));
          }}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={segmentDuration || 0}
          step={0.1}
          value={Math.min(currentTime, segmentDuration)}
          disabled={!segmentDuration}
          onChange={(event) => seek(Number(event.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed"
          aria-label="Playback position"
        />
        <span className="w-11 text-xs tabular-nums text-muted-foreground">
          {formatTime(segmentDuration)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" disabled={!segment?.url} onClick={() => seek(currentTime - 10)}>
          <Rewind className="h-4 w-4" />
        </Button>
        <Button size="icon" disabled={!segment?.url} onClick={togglePlayback}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="icon" disabled={!segment?.url} onClick={() => seek(currentTime + 10)}>
          <FastForward className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" disabled={!segment?.url} onClick={snapshot}>
          <Camera className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
