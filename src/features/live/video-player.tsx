"use client";

import Hls from "hls.js";
import { Camera as CameraIcon, Expand, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CameraView } from "@/types";

export function VideoPlayer({ camera }: { camera: CameraView }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scale, setScale] = useState(1);
  const [playbackState, setPlaybackState] = useState<
    "idle" | "connecting" | "webrtc" | "hls" | "error"
  >("idle");
  const streamAvailable = Boolean(camera.runtime?.ready);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const element = video;
    let hls: Hls | null = null;
    let peer: RTCPeerConnection | null = null;
    let whepAbort: AbortController | null = null;
    let cancelled = false;
    let retryTimeout: number | undefined;
    let playbackTimeout: number | undefined;
    let playbackWatchdog: number | undefined;
    let lastCurrentTime = 0;
    let stalledChecks = 0;
    let connectionAttempt = 0;

    function resumePlayback() {
      if (!cancelled && element.paused) {
        element.play().catch(scheduleRetry);
      }
    }

    function cleanupMedia() {
      if (retryTimeout) window.clearTimeout(retryTimeout);
      if (playbackTimeout) window.clearTimeout(playbackTimeout);
      if (playbackWatchdog) window.clearInterval(playbackWatchdog);
      whepAbort?.abort();
      whepAbort = null;
      peer?.close();
      peer = null;
      hls?.destroy();
      hls = null;
      element.removeEventListener("ended", scheduleRetry);
      element.removeEventListener("error", scheduleRetry);
      element.removeEventListener("stalled", scheduleRetry);
      element.removeEventListener("canplay", resumePlayback);
      element.pause();
      element.removeAttribute("src");
      element.srcObject = null;
      element.load();
    }

    if (!streamAvailable) {
      cleanupMedia();
      setPlaybackState("idle");
      return cleanupMedia;
    }

    function scheduleRetry() {
      if (cancelled || retryTimeout) return;
      setPlaybackState("error");
      retryTimeout = window.setTimeout(() => {
        retryTimeout = undefined;
        connectHls();
      }, 2_000);
    }

    function connectHls() {
      if (cancelled) return;
      connectionAttempt += 1;
      whepAbort?.abort();
      whepAbort = null;
      peer?.close();
      peer = null;
      if (playbackTimeout) window.clearTimeout(playbackTimeout);
      if (playbackWatchdog) window.clearInterval(playbackWatchdog);
      hls?.destroy();
      hls = null;
      element.removeEventListener("ended", scheduleRetry);
      element.removeEventListener("error", scheduleRetry);
      element.removeEventListener("stalled", scheduleRetry);
      element.removeEventListener("canplay", resumePlayback);
      element.pause();
      element.removeAttribute("src");
      element.srcObject = null;
      element.load();
      setPlaybackState("connecting");

      const markPlaying = () => {
        if (playbackTimeout) window.clearTimeout(playbackTimeout);
        if (!cancelled) setPlaybackState("hls");
      };
      element.addEventListener("playing", markPlaying, { once: true });
      element.addEventListener("canplay", resumePlayback);
      element.addEventListener("ended", scheduleRetry);
      element.addEventListener("error", scheduleRetry);
      element.addEventListener("stalled", scheduleRetry);
      playbackTimeout = window.setTimeout(scheduleRetry, 12_000);
      lastCurrentTime = element.currentTime;
      stalledChecks = 0;
      playbackWatchdog = window.setInterval(() => {
        if (cancelled || playbackState === "connecting") return;
        if (element.currentTime > lastCurrentTime + 0.05) {
          lastCurrentTime = element.currentTime;
          stalledChecks = 0;
          return;
        }
        if (!element.paused && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          stalledChecks += 1;
          if (stalledChecks >= 3) scheduleRetry();
        }
      }, 2_000);

      const sourceUrl = new URL(camera.hlsUrl);
      sourceUrl.searchParams.set(
        "v",
        `${camera.runtime?.readyTime ?? "stream"}-${connectionAttempt}`
      );

      if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = sourceUrl.toString();
        element.play().catch(scheduleRetry);
      } else if (Hls.isSupported()) {
        hls = new Hls({
          liveSyncDurationCount: 2,
          lowLatencyMode: true,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
          fragLoadingMaxRetry: 3
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          element.play().catch(scheduleRetry);
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else {
            scheduleRetry();
          }
        });
        hls.loadSource(sourceUrl.toString());
        hls.attachMedia(element);
      } else {
        scheduleRetry();
      }
    }

    async function connectWebRtc() {
      if (cancelled) return;
      setPlaybackState("connecting");
      peer = new RTCPeerConnection();
      const currentPeer = peer;
      const remoteStream = new MediaStream();

      currentPeer.addTransceiver("video", { direction: "recvonly" });
      currentPeer.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        element.srcObject = remoteStream;
      };

      const offer = await currentPeer.createOffer();
      await currentPeer.setLocalDescription(offer);
      await Promise.race([
        new Promise<void>((resolve) => {
          if (currentPeer.iceGatheringState === "complete") return resolve();
          currentPeer.addEventListener(
            "icegatheringstatechange",
            () => {
              if (currentPeer.iceGatheringState === "complete") resolve();
            },
            { once: true }
          );
        }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 1_500))
      ]);

      whepAbort = new AbortController();
      const handshakeTimeout = window.setTimeout(() => whepAbort?.abort(), 4_000);
      let response: Response;
      try {
        response = await fetch(camera.webRtcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: currentPeer.localDescription?.sdp,
          signal: whepAbort.signal
        });
      } finally {
        window.clearTimeout(handshakeTimeout);
      }
      if (!response.ok) throw new Error(`WHEP failed (${response.status})`);
      await currentPeer.setRemoteDescription({
        type: "answer",
        sdp: await response.text()
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("WebRTC connection timed out")),
          5_000
        );
        const checkConnection = () => {
          if (currentPeer.connectionState === "connected") {
            window.clearTimeout(timeout);
            resolve();
          } else if (["failed", "closed"].includes(currentPeer.connectionState)) {
            window.clearTimeout(timeout);
            reject(new Error(`WebRTC ${currentPeer.connectionState}`));
          }
        };
        currentPeer.addEventListener("connectionstatechange", checkConnection);
        checkConnection();
      });

      await element.play();
      await Promise.race([
        new Promise<void>((resolve) => {
          if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return resolve();
          element.addEventListener("loadeddata", () => resolve(), { once: true });
        }),
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error("WebRTC produced no frames")),
            3_000
          )
        )
      ]);

      if (cancelled || peer !== currentPeer) return;
      setPlaybackState("webrtc");
      currentPeer.addEventListener("connectionstatechange", () => {
        if (
          !cancelled &&
          peer === currentPeer &&
          ["failed", "disconnected", "closed"].includes(currentPeer.connectionState)
        ) {
          connectHls();
        }
      });
    }

    connectWebRtc().catch(() => {
      if (!cancelled) connectHls();
    });
    return () => {
      cancelled = true;
      cleanupMedia();
    };
  }, [camera.hlsUrl, camera.runtime?.readyTime, camera.webRtcUrl, streamAvailable]);

  function snapshot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const link = document.createElement("a");
    link.download = `${camera.pathName}-${Date.now()}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.92);
    link.click();
  }

  return (
    <div className="group relative aspect-video overflow-hidden rounded-lg border bg-black">
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain transition-transform" style={{ transform: `scale(${scale})` }} />
      {!streamAvailable && <div className="absolute inset-0 grid place-items-center text-sm text-zinc-400">Stream offline</div>}
      {streamAvailable && playbackState === "connecting" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-zinc-400">
          Connecting...
        </div>
      )}
      {streamAvailable && playbackState === "error" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-red-400">
          Playback unavailable
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-3">
        <div className="flex items-center gap-2 text-sm text-white"><span className={`h-2 w-2 rounded-full ${streamAvailable ? "bg-emerald-400" : "bg-red-500"}`} />{camera.name}</div>
        {camera.recordingEnabled && <Badge variant="destructive">REC</Badge>}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="text-xs text-zinc-300">{camera.runtime?.tracks.join(" · ") || camera.streamType} · {camera.runtime?.readers ?? 0} viewers · {playbackState.toUpperCase()}</div>
        <div className="flex">
          <Button variant="ghost" size="icon" onClick={() => setScale(Math.max(1, scale - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setScale(Math.min(3, scale + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={snapshot}><CameraIcon className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => videoRef.current?.parentElement?.requestFullscreen()}><Expand className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
