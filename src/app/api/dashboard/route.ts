import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { Camera, CameraMetric, Recording } from "@/models";
import { apiError } from "@/lib/http";
import { toJsonSafe } from "@/lib/utils";
import { requirePermission } from "@/services/auth/session";
import { mediaMtx } from "@/services/mediamtx/client";
import type { MediaMtxPath } from "@/services/mediamtx/types";

export async function GET() {
  try {
    await requirePermission("cameras:view");
    await connectMongo();
    const [cameras, recordings, runtime, recentMetrics] = await Promise.all([
      Camera.find({}, { pathName: 1, recordingEnabled: 1, enabled: 1 }).lean(),
      Recording.aggregate<{ count: number; storageBytes: number }>([
        { $group: { _id: null, count: { $sum: 1 }, storageBytes: { $sum: "$sizeBytes" } } }
      ]),
      mediaMtx.getPaths().catch(() => ({ items: [], itemCount: 0, pageCount: 0 })),
      CameraMetric.find({ capturedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
        .sort({ capturedAt: 1 })
        .limit(500)
        .lean()
    ]);

    const runtimeByName = new Map<string, MediaMtxPath>(
      runtime.items.map((path: MediaMtxPath) => [path.name, path])
    );
    const enabled = cameras.filter((camera) => camera.enabled);
    const online = enabled.filter((camera) => runtimeByName.get(camera.pathName)?.ready).length;
    const activeReaders = runtime.items.reduce((sum, path) => sum + (path.readers?.length ?? 0), 0);
    const inboundBytes = runtime.items.reduce((sum, path) => sum + (path.bytesReceived ?? 0), 0);
    const outboundBytes = runtime.items.reduce((sum, path) => sum + (path.bytesSent ?? 0), 0);
    const history = recentMetrics.map((metric) => ({
      time: metric.capturedAt,
      inbound: Number(metric.inboundBytes),
      outbound: Number(metric.outboundBytes),
      online: metric.ready ? 1 : 0
    }));

    return NextResponse.json(
      toJsonSafe({
        totals: {
          cameras: cameras.length,
          online,
          offline: enabled.length - online,
          recording: cameras.filter((camera) => camera.recordingEnabled).length,
          storageBytes: recordings[0]?.storageBytes ?? 0,
          recordings: recordings[0]?.count ?? 0,
          activeReaders,
          inboundBytes,
          outboundBytes
        },
        history
      })
    );
  } catch (error) {
    return apiError(error);
  }
}
