"use client";

import { MonitorUp, Play, Radio, Square, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeading } from "@/components/page-heading";
import { cn } from "@/lib/utils";

type PublisherType = "camera" | "screen";
type StatusTone = "idle" | "live" | "error";

interface PublisherState {
  peer: RTCPeerConnection | null;
  stream: MediaStream | null;
  resourceUrl: string | null;
}

const initialPublisher: PublisherState = {
  peer: null,
  stream: null,
  resourceUrl: null
};

function baseWebRtcUrl() {
  return process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL ?? "http://localhost:8889";
}

function statusClass(tone: StatusTone) {
  if (tone === "live") return "text-emerald-400";
  if (tone === "error") return "text-red-400";
  return "text-muted-foreground";
}

function preferH264(peer: RTCPeerConnection) {
  if (!("getCapabilities" in RTCRtpSender)) return;
  const capabilities = RTCRtpSender.getCapabilities("video");
  if (!capabilities) return;

  const h264 = capabilities.codecs.filter(
    (codec) => codec.mimeType.toLowerCase() === "video/h264"
  );
  if (!h264.length) return;

  const others = capabilities.codecs.filter(
    (codec) => codec.mimeType.toLowerCase() !== "video/h264"
  );
  peer.getTransceivers().forEach((transceiver) => {
    if (
      transceiver.sender.track?.kind === "video" &&
      transceiver.setCodecPreferences
    ) {
      transceiver.setCodecPreferences([...h264, ...others]);
    }
  });
}

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 2_000);
    const check = () => {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", check);
  });
}

async function fetchSdp(
  url: string,
  sdp: string | undefined,
  timeoutMs: number,
  label: string
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdp,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${label} failed (${response.status})`);
    return {
      answer: await response.text(),
      resourceUrl: response.headers.get("Location")
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (label === "WHEP") {
        throw new Error(
          `${label} timed out. The path is probably not online yet, or MediaMTX WebRTC is not reachable at ${url}.`
        );
      }
      throw new Error(
        `${label} timed out. Check that MediaMTX WebRTC is reachable at ${url}.`
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function waitForPeerConnection(
  peer: RTCPeerConnection,
  timeoutMs: number,
  label: string
) {
  if (peer.connectionState === "connected") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(`${label} ICE connection timed out`)),
      timeoutMs
    );
    const check = () => {
      if (peer.connectionState === "connected") {
        cleanup();
        resolve();
      } else if (["closed", "failed"].includes(peer.connectionState)) {
        cleanup();
        reject(new Error(`${label} ${peer.connectionState}`));
      }
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      peer.removeEventListener("connectionstatechange", check);
    };
    peer.addEventListener("connectionstatechange", check);
    check();
  });
}

export function PublishView() {
  const cameraVideo = useRef<HTMLVideoElement>(null);
  const screenVideo = useRef<HTMLVideoElement>(null);
  const playerVideo = useRef<HTMLVideoElement>(null);
  const publishers = useRef<Record<PublisherType, PublisherState>>({
    camera: { ...initialPublisher },
    screen: { ...initialPublisher }
  });
  const player = useRef<{ peer: RTCPeerConnection | null; resourceUrl: string | null }>({
    peer: null,
    resourceUrl: null
  });

  const [serverUrl, setServerUrl] = useState(baseWebRtcUrl());
  const [forceH264, setForceH264] = useState(true);
  const [cameraPath, setCameraPath] = useState("browser-cam");
  const [screenPath, setScreenPath] = useState("screen-share");
  const [playPath, setPlayPath] = useState("browser-cam");
  const [cameraStatus, setCameraStatus] = useState({ message: "Disconnected", tone: "idle" as StatusTone });
  const [screenStatus, setScreenStatus] = useState({ message: "Disconnected", tone: "idle" as StatusTone });
  const [playStatus, setPlayStatus] = useState({ message: "Disconnected", tone: "idle" as StatusTone });
  const [publishing, setPublishing] = useState<Record<PublisherType, boolean>>({
    camera: false,
    screen: false
  });
  const [activePublishers, setActivePublishers] = useState<Record<PublisherType, boolean>>({
    camera: false,
    screen: false
  });
  const [playConnecting, setPlayConnecting] = useState(false);
  const [playing, setPlaying] = useState(false);

  const secureContext = typeof window === "undefined" || window.isSecureContext;
  const screenShareSupported = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getDisplayMedia),
    []
  );

  useEffect(() => {
    return () => {
      stopPublisher("camera");
      stopPublisher("screen");
      stopPlayback();
    };
  }, []);

  function normalizedServerUrl() {
    return serverUrl.trim().replace(/\/$/, "");
  }

  function setPublisherStatus(type: PublisherType, message: string, tone: StatusTone = "idle") {
    if (type === "camera") setCameraStatus({ message, tone });
    else setScreenStatus({ message, tone });
  }

  function stopPublisher(type: PublisherType) {
    const state = publishers.current[type];
    if (state.resourceUrl) {
      fetch(state.resourceUrl, { method: "DELETE" }).catch(() => undefined);
    }
    state.peer?.close();
    state.stream?.getTracks().forEach((track) => track.stop());
    state.peer = null;
    state.stream = null;
    state.resourceUrl = null;

    const video = type === "camera" ? cameraVideo.current : screenVideo.current;
    if (video) video.srcObject = null;
    setPublishing((current) => ({ ...current, [type]: false }));
    setActivePublishers((current) => ({ ...current, [type]: false }));
    setPublisherStatus(type, "Disconnected");
  }

  async function startPublisher(type: PublisherType) {
    const path = (type === "camera" ? cameraPath : screenPath).trim();
    const label = type === "camera" ? "camera" : "screen share";
    const video = type === "camera" ? cameraVideo.current : screenVideo.current;
    if (!path) {
      setPublisherStatus(type, "Set a MediaMTX path first", "error");
      return;
    }

    try {
      setPublishing((current) => ({ ...current, [type]: true }));
      setPublisherStatus(type, "Requesting media...");
      const stream =
        type === "camera"
          ? await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (video) video.srcObject = stream;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      stream.getTracks().forEach((track) =>
        peer.addTransceiver(track, { direction: "sendonly", streams: [stream] })
      );
      if (forceH264) preferH264(peer);

      setPublisherStatus(type, "Negotiating WHIP...");
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGathering(peer);

      const whipUrl = `${normalizedServerUrl()}/${encodeURIComponent(path)}/whip`;
      const { answer, resourceUrl } = await fetchSdp(
        whipUrl,
        peer.localDescription?.sdp,
        10_000,
        "WHIP"
      );
      await peer.setRemoteDescription({
        type: "answer",
        sdp: answer
      });

      publishers.current[type] = {
        peer,
        stream,
        resourceUrl: resourceUrl ? new URL(resourceUrl, whipUrl).href : null
      };
      setPublishing((current) => ({ ...current, [type]: false }));
      setActivePublishers((current) => ({ ...current, [type]: true }));
      setPublisherStatus(type, `Live at /${path}`, "live");

      stream.getVideoTracks()[0]?.addEventListener("ended", () => stopPublisher(type), {
        once: true
      });
    } catch (error) {
      stopPublisher(type);
      setPublisherStatus(
        type,
        error instanceof Error ? error.message : `Failed to publish ${label}`,
        "error"
      );
    } finally {
      setPublishing((current) => ({ ...current, [type]: false }));
    }
  }

  function stopPlayback() {
    if (player.current.resourceUrl) {
      fetch(player.current.resourceUrl, { method: "DELETE" }).catch(() => undefined);
    }
    player.current.peer?.close();
    player.current.peer = null;
    player.current.resourceUrl = null;
    if (playerVideo.current) playerVideo.current.srcObject = null;
    setPlayConnecting(false);
    setPlaying(false);
    setPlayStatus({ message: "Disconnected", tone: "idle" });
  }

  async function startPlayback() {
    const path = playPath.trim();
    if (!path) {
      setPlayStatus({ message: "Set a path first", tone: "error" });
      return;
    }

    const localPublisher =
      path === cameraPath.trim()
        ? "camera"
        : path === screenPath.trim()
          ? "screen"
          : null;
    if (localPublisher && publishing[localPublisher]) {
      setPlayStatus({
        message: `/${path} is still publishing. Wait until it shows LIVE, then play it.`,
        tone: "error"
      });
      return;
    }
    if (localPublisher && !activePublishers[localPublisher]) {
      setPlayStatus({
        message: `/${path} is not online. Start ${
          localPublisher === "camera" ? "webcam" : "screen share"
        } first and wait for LIVE.`,
        tone: "error"
      });
      return;
    }

    try {
      setPlayConnecting(true);
      setPlayStatus({ message: "Connecting WHEP...", tone: "idle" });

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      peer.addTransceiver("video", { direction: "recvonly" });
      peer.addTransceiver("audio", { direction: "recvonly" });
      peer.ontrack = (event) => {
        if (!playerVideo.current) return;
        playerVideo.current.srcObject = event.streams[0];
        void playerVideo.current.play().catch(() => undefined);
      };
      peer.oniceconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.iceConnectionState) && player.current.peer === peer) {
          setPlayStatus({ message: "Connection lost", tone: "error" });
        }
      };

      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGathering(peer);

      const whepUrl = `${normalizedServerUrl()}/${encodeURIComponent(path)}/whep`;
      const { answer, resourceUrl } = await fetchSdp(
        whepUrl,
        peer.localDescription?.sdp,
        6_000,
        "WHEP"
      );
      await peer.setRemoteDescription({
        type: "answer",
        sdp: answer
      });
      await waitForPeerConnection(peer, 10_000, "WHEP");

      player.current = {
        peer,
        resourceUrl: resourceUrl ? new URL(resourceUrl, whepUrl).href : null
      };
      setPlayConnecting(false);
      setPlaying(true);
      setPlayStatus({ message: `Playing /${path}`, tone: "live" });
    } catch (error) {
      stopPlayback();
      setPlayStatus({
        message: error instanceof Error ? error.message : "Playback failed",
        tone: "error"
      });
    } finally {
      setPlayConnecting(false);
    }
  }

  function togglePublisher(type: PublisherType) {
    if (publishing[type]) return;
    if (activePublishers[type]) stopPublisher(type);
    else void startPublisher(type);
  }

  function togglePlayback() {
    if (playConnecting) return;
    if (playing) stopPlayback();
    else void startPlayback();
  }

  return (
    <>
      <PageHeading
        title="Publish"
        description="Publish webcam and screen streams to MediaMTX over WHIP, then verify them through WHEP."
      />
      {!secureContext && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Camera and screen capture require HTTPS or localhost. On a phone, use an HTTPS tunnel.
        </div>
      )}
      <Card className="mb-5">
        <CardHeader><CardTitle>WebRTC Endpoint</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={forceH264}
              onChange={(event) => setForceH264(event.target.checked)}
            />
            Prefer H.264
          </label>
        </CardContent>
      </Card>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Video className="h-4 w-4" /> Webcam</span>
              <Badge variant={activePublishers.camera ? "success" : publishing.camera ? "warning" : "default"}>{activePublishers.camera ? "LIVE" : publishing.camera ? "PUBLISHING" : "IDLE"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={cameraPath} onChange={(event) => setCameraPath(event.target.value)} placeholder="MediaMTX path" />
            <video ref={cameraVideo} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black" />
            <Button className="w-full" variant={activePublishers.camera ? "destructive" : "default"} disabled={publishing.camera} onClick={() => togglePublisher("camera")}>
              {activePublishers.camera ? <Square className="mr-2 h-4 w-4" /> : <Radio className="mr-2 h-4 w-4" />}
              {activePublishers.camera ? "Stop webcam" : publishing.camera ? "Publishing..." : "Start webcam"}
            </Button>
            <p className={cn("text-xs", statusClass(cameraStatus.tone))}>{cameraStatus.message}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><MonitorUp className="h-4 w-4" /> Screen Share</span>
              <Badge variant={activePublishers.screen ? "success" : publishing.screen ? "warning" : "default"}>{activePublishers.screen ? "LIVE" : publishing.screen ? "PUBLISHING" : "IDLE"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={screenPath} onChange={(event) => setScreenPath(event.target.value)} placeholder="MediaMTX path" />
            <video ref={screenVideo} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black" />
            <Button className="w-full" variant={activePublishers.screen ? "destructive" : "default"} disabled={!screenShareSupported || publishing.screen} onClick={() => togglePublisher("screen")}>
              {activePublishers.screen ? <Square className="mr-2 h-4 w-4" /> : <MonitorUp className="mr-2 h-4 w-4" />}
              {activePublishers.screen ? "Stop screen" : publishing.screen ? "Publishing..." : "Start screen"}
            </Button>
            <p className={cn("text-xs", statusClass(screenStatus.tone))}>
              {screenShareSupported ? screenStatus.message : "Screen sharing is not available on this device."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Play className="h-4 w-4" /> WHEP Player</span>
              <Badge variant={playing ? "success" : playConnecting ? "warning" : "default"}>{playing ? "PLAYING" : playConnecting ? "CONNECTING" : "IDLE"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={playPath} onChange={(event) => setPlayPath(event.target.value)} placeholder="MediaMTX path" />
            <video ref={playerVideo} autoPlay muted playsInline controls className="aspect-video w-full rounded-lg bg-black" />
            <Button className="w-full" variant={playing ? "destructive" : "default"} disabled={playConnecting} onClick={togglePlayback}>
              {playing ? <Square className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {playing ? "Stop playback" : playConnecting ? "Connecting..." : "Play path"}
            </Button>
            <p className={cn("text-xs", statusClass(playStatus.tone))}>{playStatus.message}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
