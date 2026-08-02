import { NextRequest, NextResponse } from "next/server";
import { AFIO_SESSION_COOKIE, sessionCookieSecret, verifySessionCookieValue } from "@/lib/session-cookie";

const protectedPrefixes = [
  "/admin",
  "/afio",
  "/change-password",
  "/dashboard",
  "/modules",
  "/patients",
  "/reports/history",
  "/reports/",
  "/scans"
];

const publicPrefixes = [
  "/api",
  "/_next",
  "/favicon.ico",
  "/forgot-password",
  "/login",
  "/reports/check",
  "/reset-password"
];

function isProtectedPath(pathname: string) {
  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const isSignedIn = await verifySessionCookieValue(
    request.cookies.get(AFIO_SESSION_COOKIE)?.value,
    sessionCookieSecret()
  );
  if (isSignedIn) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
