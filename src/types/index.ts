export type Permission =
  | "cameras:view"
  | "cameras:manage"
  | "recordings:view"
  | "recordings:manage"
  | "users:manage"
  | "settings:manage";

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CameraRuntime {
  pathName: string;
  ready: boolean;
  readyTime: string | null;
  online: boolean;
  tracks: string[];
  inboundBytes: number;
  outboundBytes: number;
  readers: number;
  bitrate: number;
  uptimeSeconds: number;
}

export interface CameraView {
  id: string;
  pathName: string;
  name: string;
  description: string | null;
  location: string | null;
  sourceUrl: string;
  streamType: "RTSP" | "RTMP" | "HLS" | "SRT" | "UDP_MPEGTS" | "IP_WEBCAM" | "LARIX";
  enabled: boolean;
  recordingEnabled: boolean;
  retentionDays: number;
  recordSegmentDuration: number;
  status: string;
  runtime: CameraRuntime | null;
  hlsUrl: string;
  webRtcUrl: string;
}
