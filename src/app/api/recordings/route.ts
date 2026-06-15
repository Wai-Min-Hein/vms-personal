import { NextRequest, NextResponse } from "next/server";
import {
  enrichRecording,
  enrichRecordings,
  withPlaybackUrls
} from "@/features/recordings/service";
import { apiError } from "@/lib/http";
import { connectMongo } from "@/lib/mongodb";
import { Camera } from "@/models";
import { requirePermission } from "@/services/auth/session";
import { mediaMtx } from "@/services/mediamtx/client";

async function getActiveRecordings() {
  await connectMongo();
  const [cameras, paths] = await Promise.all([
    Camera.find(
      { enabled: true, recordingEnabled: true },
      { pathName: 1, _id: 0 }
    ).lean(),
    mediaMtx.getPaths()
  ]);
  const readyPaths = new Set(paths.items.filter((path) => path.ready).map((path) => path.name));

  return new Set(
    cameras
      .map((camera) => camera.pathName)
      .filter((pathName) => readyPaths.has(pathName))
  );
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission("recordings:view");
    const camera = request.nextUrl.searchParams.get("camera");
    const activeRecordings = await getActiveRecordings();
    if (camera) {
      const recording = await mediaMtx.getRecording(camera);
      const playbackSegments = await mediaMtx.getPlaybackSegments(camera).catch(() => []);
      return NextResponse.json(
        await enrichRecording(
          playbackSegments.length
            ? withPlaybackUrls(recording, playbackSegments)
            : recording,
          activeRecordings.has(camera)
        )
      );
    }
    const recordings = await mediaMtx.getRecordings();
    const items = await Promise.all(
      recordings.items.map(async (recording) => {
        const playbackSegments = await mediaMtx
          .getPlaybackSegments(recording.name)
          .catch(() => []);
        return playbackSegments.length
          ? withPlaybackUrls(recording, playbackSegments)
          : recording;
      })
    );
    return NextResponse.json(await enrichRecordings({ ...recordings, items }, activeRecordings));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requirePermission("recordings:manage");
    const camera = request.nextUrl.searchParams.get("camera");
    const start = request.nextUrl.searchParams.get("start");
    const end = request.nextUrl.searchParams.get("end");
    if (!camera || !start || !end) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "camera, start, and end are required" } },
        { status: 400 }
      );
    }
    await mediaMtx.deleteRecording(camera, start, end);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
