import { NextRequest, NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { Notification } from "@/models";
import { apiError } from "@/lib/http";
import { requireUser } from "@/services/auth/session";

export async function GET() {
  try {
    await requireUser();
    await connectMongo();
    return NextResponse.json(
      await Notification.find().populate("cameraId", "name").sort({ createdAt: -1 }).limit(100)
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireUser();
    await connectMongo();
    const { id } = (await request.json()) as { id: string };
    const notification = await Notification.findByIdAndUpdate(id, { acknowledged: true }, { new: true });
    if (!notification) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Notification not found" } }, { status: 404 });
    return NextResponse.json(notification);
  } catch (error) {
    return apiError(error);
  }
}
