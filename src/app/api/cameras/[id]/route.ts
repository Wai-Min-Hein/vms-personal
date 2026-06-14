import { NextRequest, NextResponse } from "next/server";
import { cameraPatchSchema } from "@/features/cameras/schemas";
import { cameraService } from "@/features/cameras/service";
import { apiError } from "@/lib/http";
import { requirePermission } from "@/services/auth/session";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  try {
    await requirePermission("cameras:view");
    return NextResponse.json(await cameraService.get((await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const user = await requirePermission("cameras:manage");
    const patch = cameraPatchSchema.parse(await request.json());
    return NextResponse.json(await cameraService.update((await params).id, patch, user.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    const user = await requirePermission("cameras:manage");
    await cameraService.delete((await params).id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
