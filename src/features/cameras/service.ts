import { publicEnv } from "@/lib/env";
import { connectMongo } from "@/lib/mongodb";
import { AuditLog, Camera } from "@/models";
import type { AuditAction } from "@/models/constants";
import { mediaMtx, MediaMtxError } from "@/services/mediamtx/client";
import type { MediaMtxPathConfiguration } from "@/services/mediamtx/types";
import type { MediaMtxPath } from "@/services/mediamtx/types";
import type { CameraInput, CameraPatch } from "./schemas";

function duration(value: number) {
  return `${value}s`;
}

function mediaMtxConfig(camera: {
  sourceUrl: string;
  enabled: boolean;
  recordingEnabled: boolean;
  retentionDays: number;
  recordSegmentDuration: number;
  pathName: string;
}): MediaMtxPathConfiguration {
  return {
    source: camera.enabled ? camera.sourceUrl : "publisher",
    sourceOnDemand: false,
    record: camera.enabled && camera.recordingEnabled,
    recordFormat: "fmp4",
    recordPath: "/recordings/%path/%Y-%m-%d_%H-%M-%S-%f",
    recordSegmentDuration: duration(camera.recordSegmentDuration),
    recordDeleteAfter: duration(camera.retentionDays * 86400)
  };
}

async function createOrPatchPath(name: string, config: MediaMtxPathConfiguration) {
  try {
    await mediaMtx.patchPath(name, config);
  } catch (error) {
    if (!(error instanceof MediaMtxError) || error.status !== 404) throw error;
    await mediaMtx.createPath(name, config);
  }
}

async function deletePathIfPresent(name: string) {
  try {
    await mediaMtx.deletePath(name);
  } catch (error) {
    if (!(error instanceof MediaMtxError) || error.status !== 404) throw error;
  }
}

async function audit(
  action: AuditAction,
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>
) {
  await connectMongo();
  await AuditLog.create({ action, entityType: "Camera", entityId, userId, metadata });
}

export const cameraService = {
  async list() {
    await connectMongo();
    const [cameras, runtime] = await Promise.all([
      Camera.find().populate("groupId").sort({ name: 1 }),
      mediaMtx.getPaths().catch(() => ({ items: [], itemCount: 0, pageCount: 0 }))
    ]);
    const runtimeByName = new Map<string, MediaMtxPath>(
      runtime.items.map((path: MediaMtxPath) => [path.name, path])
    );

    return cameras.map((document) => {
      const camera = document.toJSON();
      const path = runtimeByName.get(camera.pathName);
      return {
        ...camera,
        runtime: path
          ? {
              pathName: path.name,
              ready: path.ready,
              online: path.ready,
              tracks: path.tracks ?? [],
              inboundBytes: path.bytesReceived ?? 0,
              outboundBytes: path.bytesSent ?? 0,
              readers: path.readers?.length ?? 0,
              bitrate: 0,
              uptimeSeconds: path.readyTime
                ? Math.max(0, (Date.now() - new Date(path.readyTime).getTime()) / 1000)
                : 0
            }
          : null,
        hlsUrl: `${publicEnv.NEXT_PUBLIC_MEDIAMTX_HLS_URL}/${camera.pathName}/index.m3u8`,
        webRtcUrl: `${publicEnv.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL}/${camera.pathName}/whep`
      };
    });
  },

  async get(id: string) {
    await connectMongo();
    const camera = await Camera.findById(id).populate("groupId");
    if (!camera) throw new Error("Camera not found");
    return camera;
  },

  async create(input: CameraInput, userId?: string) {
    await mediaMtx.createPath(input.pathName, mediaMtxConfig(input));
    try {
      await connectMongo();
      const camera = await Camera.create({
        ...input,
        status: input.enabled ? "UNKNOWN" : "DISABLED"
      });
      await audit("CREATE", camera.id, userId, { pathName: camera.pathName });
      return camera.toJSON();
    } catch (error) {
      await mediaMtx.deletePath(input.pathName).catch(() => undefined);
      throw error;
    }
  },

  async update(id: string, patch: CameraPatch, userId?: string) {
    const current = await this.get(id);
    const next = { ...current.toObject(), ...patch };
    const mediaMtxFields: Array<keyof CameraPatch> = [
      "sourceUrl",
      "enabled",
      "recordingEnabled",
      "retentionDays",
      "recordSegmentDuration"
    ];
    const requiresMediaMtxPatch = mediaMtxFields.some(
      (field) => field in patch && patch[field] !== current.get(field)
    );

    if (patch.pathName && patch.pathName !== current.pathName) {
      await mediaMtx.createPath(patch.pathName, mediaMtxConfig(next));
      try {
        const updated = await Camera.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
        if (!updated) throw new Error("Camera not found");
        await mediaMtx.deletePath(current.pathName);
        await audit("UPDATE", id, userId, { changed: Object.keys(patch) });
        return updated.toJSON();
      } catch (error) {
        await mediaMtx.deletePath(patch.pathName).catch(() => undefined);
        throw error;
      }
    }

    if (requiresMediaMtxPatch) {
      await mediaMtx.patchPath(current.pathName, mediaMtxConfig(next));
    }
    const updated = await Camera.findByIdAndUpdate(
      id,
      {
        ...patch,
        ...(patch.enabled === false ? { status: "DISABLED" } : {})
      },
      { new: true, runValidators: true }
    );
    if (!updated) throw new Error("Camera not found");
    await audit("UPDATE", id, userId, { changed: Object.keys(patch) });
    return updated.toJSON();
  },

  async delete(id: string, userId?: string) {
    const camera = await this.get(id);
    await mediaMtx.deletePath(camera.pathName);
    await Camera.findByIdAndDelete(id);
    await audit("DELETE", id, userId, { pathName: camera.pathName });
  },

  async test(id: string) {
    const camera = await this.get(id);
    const path = await mediaMtx.getPath(camera.pathName);
    return { reachable: true, ready: path.ready, tracks: path.tracks ?? [] };
  },

  async setEnabled(id: string, enabled: boolean, userId?: string) {
    const camera = await this.get(id);
    if (camera.enabled === enabled) return camera.toJSON();

    if (enabled) {
      await createOrPatchPath(
        camera.pathName,
        mediaMtxConfig({ ...camera.toObject(), enabled: true })
      );
      try {
        camera.enabled = true;
        camera.status = "UNKNOWN";
        await camera.save();
      } catch (error) {
        await mediaMtx.deletePath(camera.pathName).catch(() => undefined);
        throw error;
      }
    } else {
      const previousConfig = mediaMtxConfig(camera.toObject());
      await deletePathIfPresent(camera.pathName);
      try {
        camera.enabled = false;
        camera.status = "DISABLED";
        await camera.save();
      } catch (error) {
        await mediaMtx
          .createPath(camera.pathName, previousConfig)
          .catch(() => undefined);
        throw error;
      }
    }

    await audit(enabled ? "ENABLE" : "DISABLE", id, userId);
    return camera.toJSON();
  },

  async restart(id: string, userId?: string) {
    const camera = await this.get(id);
    if (!camera.enabled) {
      throw new Error("Enable the camera before restarting it");
    }

    await deletePathIfPresent(camera.pathName);
    try {
      await createOrPatchPath(camera.pathName, mediaMtxConfig(camera.toObject()));
    } catch (error) {
      throw error;
    }

    camera.status = "UNKNOWN";
    await camera.save();
    await audit("RESTART", id, userId);
    return camera.toJSON();
  }
};
