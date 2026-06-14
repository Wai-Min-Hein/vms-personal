import { NextRequest, NextResponse } from "next/server";
import { cameraInputSchema } from "@/features/cameras/schemas";
import { cameraService } from "@/features/cameras/service";
import { apiError } from "@/lib/http";
import { toJsonSafe } from "@/lib/utils";
import { requirePermission } from "@/services/auth/session";

export async function GET() {
  try {
    await requirePermission("cameras:view");
    return NextResponse.json(toJsonSafe(await cameraService.list()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("cameras:manage");
    const input = cameraInputSchema.parse(await request.json());
    return NextResponse.json(await cameraService.create(input, user.id), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
