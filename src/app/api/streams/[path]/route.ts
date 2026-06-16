import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { requirePermission } from "@/services/auth/session";
import { mediaMtx, MediaMtxError } from "@/services/mediamtx/client";

type Context = { params: Promise<{ path: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { path } = await params;
  try {
    await requirePermission("cameras:view");
    const stream = await mediaMtx.getPath(path);
    return NextResponse.json({
      name: stream.name,
      ready: stream.ready,
      tracks: stream.tracks ?? [],
      readers: stream.readers?.length ?? 0
    });
  } catch (error) {
    if (error instanceof MediaMtxError && error.status === 404) {
      return NextResponse.json(
        { name: path, ready: false, tracks: [], readers: 0 },
        { status: 404 }
      );
    }
    return apiError(error);
  }
}
