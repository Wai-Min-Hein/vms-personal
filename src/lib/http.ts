import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { MediaMtxError } from "@/services/mediamtx/client";
import { AuthenticationError, AuthorizationError } from "@/services/auth/session";

export function apiError(error: unknown) {
  console.error(error);

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() } },
      { status: 400 }
    );
  }
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: { code: "ACCESS_DENIED", message: error.message } },
      { status: error.status }
    );
  }
  if (error instanceof MediaMtxError) {
    return NextResponse.json(
      { error: { code: "MEDIAMTX_ERROR", message: error.message, details: error.body } },
      { status: error.status }
    );
  }
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    return NextResponse.json(
      { error: { code: "DATABASE_VALIDATION_ERROR", message: error.message } },
      { status: 400 }
    );
  }
  if (typeof error === "object" && error && "code" in error && error.code === 11000) {
    return NextResponse.json(
      { error: { code: "DUPLICATE_VALUE", message: "A unique value already exists" } },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    { status: 500 }
  );
}
