import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { apiError } from "@/lib/http";
import { connectMongo } from "@/lib/mongodb";
import { toJsonSafe } from "@/lib/utils";
import { Camera } from "@/models";
import { mediaMtx } from "@/services/mediamtx/client";
import type { MediaMtxPath } from "@/services/mediamtx/types";

function requireIngestToken(request: NextRequest) {
  if (!env.ALARM_INGEST_TOKEN) {
    throw new Error("ALARM_INGEST_TOKEN is not configured");
  }
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (token !== env.ALARM_INGEST_TOKEN) {
    return NextResponse.json(
      { error: { code: "ACCESS_DENIED", message: "Invalid alarm ingest token" } },
      { status: 401 }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const denied = requireIngestToken(request);
    if (denied) return denied;

    await connectMongo();
    const rtspBaseUrl = env.TAMPER_RTSP_BASE_URL.replace(/\/$/, "");
    const [cameras, paths] = await Promise.all([
      Camera.find({ enabled: true }, { _id: 1, name: 1, pathName: 1 })
        .sort({ name: 1 })
        .lean(),
      mediaMtx.getPaths()
    ]);
    const readyPaths = new Set(
      paths.items
        .filter((path: MediaMtxPath) => path.ready)
        .map((path: MediaMtxPath) => path.name)
    );

    return NextResponse.json(
      toJsonSafe(
        cameras
          .filter((camera) => readyPaths.has(camera.pathName))
          .map((camera) => ({
            id: camera._id,
            name: camera.name,
            pathName: camera.pathName,
            rtspUrl: `${rtspBaseUrl}/${encodeURIComponent(camera.pathName)}`
          }))
      )
    );
  } catch (error) {
    return apiError(error);
  }
}
