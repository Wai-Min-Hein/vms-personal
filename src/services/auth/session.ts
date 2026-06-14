import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { connectMongo } from "@/lib/mongodb";
import { User } from "@/models";
import type { Permission } from "@/types";

const COOKIE_NAME = "vms_session";
const secret = new TextEncoder().encode(env.AUTH_SECRET);

export class AuthenticationError extends Error {
  readonly status = 401;
}

export class AuthorizationError extends Error {
  readonly status = 403;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: Permission[];
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: String(payload.role),
      permissions: payload.permissions as Permission[]
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session) throw new AuthenticationError("Authentication required");
  const currentUser = await refreshSessionUser(session.id);
  if (!currentUser) throw new AuthenticationError("Session is no longer active");
  return currentUser;
}

export async function requirePageUser() {
  try {
    return await requireUser();
  } catch {
    redirect("/login");
  }
}

export async function requirePermission(permission: Permission) {
  const session = await requireUser();
  if (!session.permissions.includes(permission)) {
    throw new AuthorizationError(`Missing permission: ${permission}`);
  }
  return session;
}

export async function refreshSessionUser(userId: string) {
  await connectMongo();
  const user = await User.findById(userId).populate("roleId");
  if (!user?.active) return null;
  const role = user.roleId as unknown as { name: string; permissions: Permission[] };
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: role.name,
    permissions: role.permissions
  };
}
