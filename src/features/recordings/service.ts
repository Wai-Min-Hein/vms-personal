import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { env, publicEnv } from "@/lib/env";
import type {
  MediaMtxRecording,
  MediaMtxRecordingSegment,
  PaginatedResponse
} from "@/services/mediamtx/types";

const execFileAsync = promisify(execFile);

function publicPlaybackUrl(camera: string, start: string, duration: number) {
  const params = new URLSearchParams({
    path: camera,
    start,
    duration: String(duration)
  });
  return `${publicEnv.NEXT_PUBLIC_MEDIAMTX_PLAYBACK_URL}/get?${params.toString()}`;
}

function recordingFilePath(camera: string, start: string) {
  const parsedStart = new Date(start);
  if (Number.isNaN(parsedStart.getTime())) return null;

  const match = start.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d+)Z$/
  );
  if (!match) return null;

  const fileName = `${match[1]}_${match[2]}-${match[3]}-${match[4]}-${match[5]}.mp4`;
  const recordingsRoot = path.resolve(env.RECORDINGS_PATH);
  const filePath = path.resolve(recordingsRoot, camera, fileName);
  const relativePath = path.relative(recordingsRoot, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return filePath;
}

async function probeDuration(segment: MediaMtxRecordingSegment, camera: string) {
  const existingDuration = Number(segment.duration);
  if (Number.isFinite(existingDuration) && existingDuration >= 0) {
    return existingDuration;
  }

  const filePath = recordingFilePath(camera, segment.start);
  if (!filePath) return null;

  try {
    const { stdout } = await execFileAsync(
      env.FFPROBE_PATH,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ],
      { timeout: 5_000 }
    );
    const duration = Number(stdout.trim());
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
  } catch {
    return null;
  }
}

async function enrichRecording(
  recording: MediaMtxRecording,
  recordingActive = false
): Promise<MediaMtxRecording> {
  const segments = await Promise.all(
    recording.segments.map(async (segment, index) => {
      const active = recordingActive && index === recording.segments.length - 1;
      const probedDuration = await probeDuration(segment, recording.name);
      if (probedDuration !== null) {
        return {
          ...segment,
          duration: probedDuration,
          url: publicPlaybackUrl(recording.name, segment.start, probedDuration),
          active
        };
      }

      const nextStart = recording.segments[index + 1]?.start;
      const startMs = new Date(segment.start).getTime();
      const nextStartMs = nextStart ? new Date(nextStart).getTime() : Number.NaN;
      const inferredDuration = (nextStartMs - startMs) / 1000;

      const duration =
        Number.isFinite(inferredDuration) && inferredDuration >= 0
          ? inferredDuration
          : null;

      return {
        ...segment,
        active,
        duration,
        url:
          duration === null
            ? undefined
            : publicPlaybackUrl(recording.name, segment.start, duration)
      };
    })
  );

  return { ...recording, segments };
}

export async function enrichRecordings(
  response: PaginatedResponse<MediaMtxRecording>,
  activeRecordings: ReadonlySet<string> = new Set()
): Promise<PaginatedResponse<MediaMtxRecording>> {
  return {
    ...response,
    items: await Promise.all(
      response.items.map((recording) =>
        enrichRecording(recording, activeRecordings.has(recording.name))
      )
    )
  };
}

export { enrichRecording };

export function withPlaybackUrls(
  recording: MediaMtxRecording,
  playbackRanges: MediaMtxRecordingSegment[]
): MediaMtxRecording {
  const rangeBounds = playbackRanges
    .map((range) => {
      const start = new Date(range.start).getTime();
      const duration = Number(range.duration);
      return {
        start,
        end: start + duration * 1000
      };
    })
    .filter(
      (range) =>
        Number.isFinite(range.start) &&
        Number.isFinite(range.end) &&
        range.end >= range.start
    );

  return {
    ...recording,
    segments: recording.segments.map((segment, index) => {
      const start = new Date(segment.start).getTime();
      const nextStart = recording.segments[index + 1]
        ? new Date(recording.segments[index + 1].start).getTime()
        : Number.NaN;
      const range = rangeBounds.find(
        (candidate) => start >= candidate.start && start < candidate.end
      );
      const end =
        range && Number.isFinite(nextStart) && nextStart <= range.end
          ? nextStart
          : range?.end;
      const duration =
        end !== undefined && Number.isFinite(start)
          ? Math.max(0, (end - start) / 1000)
          : null;

      return {
        ...segment,
        duration,
        url:
          duration === null
            ? undefined
            : publicPlaybackUrl(recording.name, segment.start, duration)
      };
    })
  };
}
