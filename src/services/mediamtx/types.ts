export interface MediaMtxPathConfiguration {
  name?: string;
  source: string;
  sourceOnDemand?: boolean;
  sourceOnDemandStartTimeout?: string;
  sourceOnDemandCloseAfter?: string;
  record?: boolean;
  recordFormat?: "fmp4" | "mpegts";
  recordPath?: string;
  recordPartDuration?: string;
  recordSegmentDuration?: string;
  recordDeleteAfter?: string;
}

export interface MediaMtxPath {
  name: string;
  confName?: string;
  source?: {
    type?: string;
    id?: string;
  } | null;
  ready: boolean;
  readyTime?: string | null;
  tracks?: string[];
  bytesReceived?: number;
  bytesSent?: number;
  readers?: Array<{ type?: string; id?: string }>;
}

export interface MediaMtxRecordingSegment {
  start: string;
  duration?: number | null;
  url?: string;
  active?: boolean;
}

export interface MediaMtxRecording {
  name: string;
  segments: MediaMtxRecordingSegment[];
}

export interface PaginatedResponse<T> {
  pageCount: number;
  itemCount: number;
  items: T[];
}
