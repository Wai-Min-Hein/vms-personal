"use client";

import Hls from "hls.js";
import { Camera as CameraIcon, Expand, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CameraView } from "@/types";

export function VideoPlayer({ camera }: { camera: CameraView }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [scale, setScale] = useState(1);
  const [playbackState, setPlaybackState] = useState<
    "idle" | "connecting" | "webrtc" | "hls" | "error"
  >("idle");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const element = video;
    let hls: Hls | null = null;
    let cancelled = false;
    let fallbackStarted = false;
    let frameTimeout: number | undefined;

    function cleanupMedia() {
      if (frameTimeout) window.clearTimeout(frameTimeout);
      peerRef.current?.close();
      peerRef.current = null;
      hls?.destroy();
      hls = null;
      element.pause();
      element.removeAttribute("src");
      element.srcObject = null;
      element.load();
    }

    if (!camera.runtime?.ready) {
      cleanupMedia();
      setPlaybackState("idle");
      return cleanupMedia;
    }

    async function connectWebRtc() {
      setPlaybackState("connecting");
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addTransceiver("video", { direction: "recvonly" });
      peer.ontrack = (event) => {
        element.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === "complete") return resolve();
        const listener = () => { if (peer.iceGatheringState === "complete") { peer.removeEventListener("icegatheringstatechange", listener); resolve(); } };
        peer.addEventListener("icegatheringstatechange", listener);
        setTimeout(resolve, 2_000);
      });
      const response = await fetch(camera.webRtcUrl, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: peer.localDescription?.sdp });
      if (!response.ok) throw new Error("WHEP unavailable");
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("WebRTC connection timed out")), 4_000);
        const checkState = () => {
          if (peer.connectionState === "connected") {
            window.clearTimeout(timeout);
            peer.removeEventListener("connectionstatechange", checkState);
            resolve();
          } else if (["failed", "closed"].includes(peer.connectionState)) {
            window.clearTimeout(timeout);
            peer.removeEventListener("connectionstatechange", checkState);
            reject(new Error(`WebRTC connection ${peer.connectionState}`));
          }
        };
        peer.addEventListener("connectionstatechange", checkState);
        checkState();
      });
      await element.play();
      await new Promise<void>((resolve, reject) => {
        if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return resolve();
        frameTimeout = window.setTimeout(
          () => reject(new Error("WebRTC did not produce video frames")),
          3_000
        );
        element.addEventListener(
          "loadeddata",
          () => {
            if (frameTimeout) window.clearTimeout(frameTimeout);
            resolve();
          },
          { once: true }
        );
      });
      if (!cancelled) setPlaybackState("webrtc");
    }

    function connectHls() {
      if (cancelled || fallbackStarted) return;
      fallbackStarted = true;
      peerRef.current?.close();
      peerRef.current = null;
      element.srcObject = null;
      setPlaybackState("connecting");

      const markPlaying = () => {
        if (!cancelled) setPlaybackState("hls");
      };
      element.addEventListener("playing", markPlaying, { once: true });

      if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = camera.hlsUrl;
        element.play().catch(() => setPlaybackState("error"));
      } else if (Hls.isSupported()) {
        hls = new Hls({
          liveSyncDurationCount: 2,
          lowLatencyMode: true,
          manifestLoadingMaxRetry: 6,
          levelLoadingMaxRetry: 6,
          fragLoadingMaxRetry: 6
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          element.play().catch(() => setPlaybackState("error"));
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls?.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else {
            setPlaybackState("error");
          }
        });
        hls.loadSource(camera.hlsUrl);
        hls.attachMedia(element);
      } else {
        setPlaybackState("error");
      }
    }

    connectWebRtc().catch(() => {
      connectHls();
    });
    return () => {
      cancelled = true;
      cleanupMedia();
    };
  }, [camera.hlsUrl, camera.runtime?.ready, camera.webRtcUrl]);

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
      <video ref={videoRef} muted playsInline className="h-full w-full object-contain transition-transform" style={{ transform: `scale(${scale})` }} />
      {!camera.runtime?.ready && <div className="absolute inset-0 grid place-items-center text-sm text-zinc-400">Stream offline</div>}
      {camera.runtime?.ready && playbackState === "connecting" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-zinc-400">
          Connecting...
        </div>
      )}
      {camera.runtime?.ready && playbackState === "error" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-red-400">
          Playback unavailable
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-3">
        <div className="flex items-center gap-2 text-sm text-white"><span className={`h-2 w-2 rounded-full ${camera.runtime?.ready ? "bg-emerald-400" : "bg-red-500"}`} />{camera.name}</div>
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
