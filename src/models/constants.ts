export const CAMERA_STATUSES = ["ONLINE", "OFFLINE", "DISABLED", "DEGRADED", "UNKNOWN"] as const;
export const STREAM_TYPES = ["RTSP", "RTMP", "HLS", "SRT", "UDP_MPEGTS", "IP_WEBCAM", "LARIX"] as const;
export const RECORDING_STATUSES = ["RECORDING", "COMPLETED", "FAILED", "DELETED"] as const;
export const TAMPER_TYPES = ["COVERED", "BLURRED", "MOVED", "OVEREXPOSED"] as const;
export const NOTIFICATION_TYPES = [
  "CAMERA_OFFLINE", "CAMERA_ONLINE", "RECORDING_STARTED", "RECORDING_STOPPED",
  "STORAGE_LOW", "MEDIAMTX_ERROR", "CAMERA_TAMPER"
] as const;
export const NOTIFICATION_SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;
export const AUDIT_ACTIONS = [
  "CREATE", "UPDATE", "DELETE", "ENABLE", "DISABLE", "TEST", "RESTART",
  "LOGIN", "LOGOUT", "DOWNLOAD"
] as const;

export type CameraStatus = (typeof CAMERA_STATUSES)[number];
export type StreamType = (typeof STREAM_TYPES)[number];
export type TamperType = (typeof TAMPER_TYPES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
