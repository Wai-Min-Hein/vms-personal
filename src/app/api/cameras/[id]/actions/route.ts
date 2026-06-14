import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cameraService } from "@/features/cameras/service";
import { apiError } from "@/lib/http";
import { requirePermission } from "@/services/auth/session";

const schema = z.object({ action: z.enum(["enable", "disable", "test", "restart", "record", "stop"]) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await requirePermission("cameras:manage");
    const { action } = schema.parse(await request.json());
    const id = (await params).id;

    if (action === "test") return NextResponse.json(await cameraService.test(id));
    if (action === "restart") return NextResponse.json(await cameraService.restart(id, user.id));
    if (action === "enable") return NextResponse.json(await cameraService.setEnabled(id, true, user.id));
    if (action === "disable") return NextResponse.json(await cameraService.setEnabled(id, false, user.id));
    return NextResponse.json(
      await cameraService.update(id, { recordingEnabled: action === "record" }, user.id)
    );
  } catch (error) {
    return apiError(error);
  }
}
