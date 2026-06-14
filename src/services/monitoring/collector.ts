import { connectMongo } from "@/lib/mongodb";
import { Camera, CameraMetric, Notification } from "@/models";
import { mediaMtx } from "@/services/mediamtx/client";
import type { MediaMtxPath } from "@/services/mediamtx/types";

export async function collectCameraHealth() {
  await connectMongo();
  const [cameras, paths] = await Promise.all([
    Camera.find(),
    mediaMtx.getPaths()
  ]);
  const pathByName = new Map<string, MediaMtxPath>(
    paths.items.map((path: MediaMtxPath) => [path.name, path])
  );

  for (const camera of cameras) {
    if (!camera.enabled) continue;
    const path = pathByName.get(camera.pathName);
    const ready = path?.ready ?? false;
    const nextStatus = ready ? "ONLINE" : "OFFLINE";
    const changed = camera.status !== nextStatus;
    const readyTime = path?.readyTime ? new Date(path.readyTime) : null;

    await Promise.all([
      Camera.findByIdAndUpdate(camera.id, {
        status: nextStatus,
        lastSeenAt: ready ? new Date() : camera.lastSeenAt
      }),
      CameraMetric.create({
          cameraId: camera.id,
          ready,
          inboundBytes: path?.bytesReceived ?? 0,
          outboundBytes: path?.bytesSent ?? 0,
          readers: path?.readers?.length ?? 0,
          bitrate: 0,
          uptimeSeconds: readyTime ? Math.max(0, Math.floor((Date.now() - readyTime.getTime()) / 1000)) : 0
      }),
      ...(changed && camera.status !== "UNKNOWN"
        ? [Notification.create({
              cameraId: camera.id,
              type: ready ? "CAMERA_ONLINE" : "CAMERA_OFFLINE",
              severity: ready ? "INFO" : "ERROR",
              title: `${camera.name} is ${ready ? "online" : "offline"}`,
              message: ready
                ? "The camera stream is ready again."
                : "MediaMTX reports that the camera path is not ready."
          })]
        : [])
    ]);
  }
}
