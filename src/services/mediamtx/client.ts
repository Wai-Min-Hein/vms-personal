import { env } from "@/lib/env";
import type {
  MediaMtxPath,
  MediaMtxPathConfiguration,
  MediaMtxRecording,
  PaginatedResponse
} from "./types";

export class MediaMtxError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "MediaMtxError";
  }
}

function authHeaders(): HeadersInit {
  if (!env.MEDIAMTX_API_USERNAME) return {};
  const credentials = Buffer.from(
    `${env.MEDIAMTX_API_USERNAME}:${env.MEDIAMTX_API_PASSWORD ?? ""}`
  ).toString("base64");
  return { Authorization: `Basic ${credentials}` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${env.MEDIAMTX_API_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders(),
        ...init.headers
      }
    });

    const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const detail =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
          ? `: ${body.error}`
          : "";
      throw new MediaMtxError(
        `MediaMTX request failed (${response.status})${detail}`,
        response.status,
        body
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof MediaMtxError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MediaMtxError("MediaMTX request timed out", 504);
    }
    throw new MediaMtxError("MediaMTX is unavailable", 503, error);
  } finally {
    clearTimeout(timeout);
  }
}

function safePath(name: string) {
  return encodeURIComponent(name);
}

export const mediaMtx = {
  createPath(name: string, config: MediaMtxPathConfiguration) {
    return request<void>(`/v3/config/paths/add/${safePath(name)}`, {
      method: "POST",
      body: JSON.stringify(config)
    });
  },

  patchPath(name: string, config: Partial<MediaMtxPathConfiguration>) {
    return request<void>(`/v3/config/paths/patch/${safePath(name)}`, {
      method: "PATCH",
      body: JSON.stringify(config)
    });
  },

  deletePath(name: string) {
    return request<void>(`/v3/config/paths/delete/${safePath(name)}`, {
      method: "DELETE"
    });
  },

  getPath(name: string) {
    return request<MediaMtxPath>(`/v3/paths/get/${safePath(name)}`);
  },

  getPaths() {
    return request<PaginatedResponse<MediaMtxPath>>("/v3/paths/list");
  },

  getReaders(name: string) {
    return request<MediaMtxPath>(`/v3/paths/get/${safePath(name)}`).then(
      (path) => path.readers ?? []
    );
  },

  getRecordings() {
    return request<PaginatedResponse<MediaMtxRecording>>("/v3/recordings/list");
  },

  getRecording(name: string) {
    return request<MediaMtxRecording>(`/v3/recordings/get/${safePath(name)}`);
  },

  deleteRecording(name: string, start: string, end: string) {
    const params = new URLSearchParams({ start, end });
    return request<void>(
      `/v3/recordings/deletesegment/${safePath(name)}?${params.toString()}`,
      { method: "DELETE" }
    );
  }
};
