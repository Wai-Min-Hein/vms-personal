import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { apiError } from "@/lib/http";
import { connectMongo } from "@/lib/mongodb";
import { toJsonSafe } from "@/lib/utils";
import { Alarm, Camera, Notification } from "@/models";
import { TAMPER_TYPES } from "@/models/constants";
import { requirePermission } from "@/services/auth/session";

const alarmInputSchema = z.object({
  cameraId: z.string().min(1),
  type: z.enum(TAMPER_TYPES),
  confidence: z.number().min(0).max(1),
  screenshotPath: z.string().min(1),
  timestamp: z.string().datetime()
});

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

async function emitAlarm(alarm: unknown) {
  if (!env.REALTIME_INTERNAL_URL) return;
  await fetch(`${env.REALTIME_INTERNAL_URL.replace(/\/$/, "")}/emit/alarm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alarm)
  }).catch((error) => {
    console.error("Failed to emit alarm realtime event", error);
  });
}

export async function GET() {
  try {
    await requirePermission("cameras:view");
    await connectMongo();
    const alarms = await Alarm.find()
      .populate("cameraId", "name pathName")
      .sort({ detectedAt: -1 })
      .limit(100);
    return NextResponse.json(toJsonSafe(alarms));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = requireIngestToken(request);
    if (denied) return denied;

    await connectMongo();
    const input = alarmInputSchema.parse(await request.json());
    const camera = await Camera.findById(input.cameraId);
    if (!camera) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Camera not found" } },
        { status: 404 }
      );
    }

    const alarm = await Alarm.create({
      cameraId: camera.id,
      type: input.type,
      confidence: input.confidence,
      screenshotPath: input.screenshotPath,
      detectedAt: new Date(input.timestamp)
    });

    await Notification.create({
      cameraId: camera.id,
      type: "CAMERA_TAMPER",
      severity: input.confidence >= 0.9 ? "CRITICAL" : "ERROR",
      title: `${camera.name} tamper detected`,
      message: `${input.type.toLowerCase()} tamper detected with ${Math.round(input.confidence * 100)}% confidence.`
    });

    const payload = toJsonSafe({
      ...alarm.toJSON(),
      camera: { id: camera.id, name: camera.name, pathName: camera.pathName }
    });
    await emitAlarm(payload);

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
