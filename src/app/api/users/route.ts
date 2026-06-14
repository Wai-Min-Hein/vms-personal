import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { AuditLog, Role, User } from "@/models";
import { apiError } from "@/lib/http";
import { requirePermission } from "@/services/auth/session";

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(10).max(200),
  roleId: z.string().regex(/^[a-f\d]{24}$/i)
});

export async function GET() {
  try {
    await requirePermission("users:manage");
    await connectMongo();
    const [users, roles] = await Promise.all([
      User.find().populate("roleId").sort({ name: 1 }),
      Role.find().sort({ name: 1 })
    ]);
    return NextResponse.json({
      users: users.map((document) => {
        const user = document.toJSON();
        return { ...user, role: user.roleId };
      }),
      roles
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission("users:manage");
    const input = schema.parse(await request.json());
    await connectMongo();
    const user = await User.create({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hash(input.password, 12),
      roleId: input.roleId
    });
    await user.populate("roleId");
    await AuditLog.create({ userId: actor.id, action: "CREATE", entityType: "User", entityId: user.id });
    const safeUser = user.toJSON();
    return NextResponse.json({ ...safeUser, role: safeUser.roleId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
