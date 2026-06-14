import { NextResponse } from "next/server";
import { cameraService } from "@/features/cameras/service";
import { apiError } from "@/lib/http";
import { toJsonSafe } from "@/lib/utils";
import { requirePermission } from "@/services/auth/session";

export async function GET() {
  try {
    await requirePermission("cameras:view");
    return NextResponse.json(toJsonSafe((await cameraService.list()).filter((camera) => camera.enabled)));
  } catch (error) {
    return apiError(error);
  }
}
