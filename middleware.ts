import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("vms_session")?.value;
  const isLogin = request.nextUrl.pathname === "/login";
  const isPublicApi = request.nextUrl.pathname === "/api/auth/login";
  let authenticated = false;

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
      await jwtVerify(token, secret);
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated && !isLogin && !isPublicApi) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("vms_session");
    return response;
  }
  if (authenticated && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  const response = NextResponse.next();
  if (token && !authenticated) response.cookies.delete("vms_session");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
