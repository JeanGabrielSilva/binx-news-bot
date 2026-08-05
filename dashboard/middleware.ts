import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sha256Hex, AUTH_COOKIE } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return new NextResponse("DASHBOARD_PASSWORD não configurada", { status: 500 });
  }

  const expected = await sha256Hex(password);
  if (req.cookies.get(AUTH_COOKIE)?.value !== expected) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
