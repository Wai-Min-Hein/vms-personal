import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { AuditLog, User } from "@/models";
import { apiError } from "@/lib/http";
import { createSession } from "@/services/auth/session";
import type { Permission } from "@/types";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    await connectMongo();
    const user = await User.findOne({ email: input.email.toLowerCase() })
      .select("+passwordHash")
      .populate("roleId");
    if (!user?.active || !(await compare(input.password, user.passwordHash))) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }
    const role = user.roleId as unknown as { name: string; permissions: Permission[] };
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: role.name,
      permissions: role.permissions
    });
    await AuditLog.create({ userId: user.id, action: "LOGIN", entityType: "Session" });
    return NextResponse.json({ user: { name: user.name, role: role.name } });
  } catch (error) {
    return apiError(error);
  }
}
