import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Public routes — no auth required. iOS Safari fetches the apple-icon and
// the manifest *before* the user has signed in (when they tap "添加到主屏幕"),
// so blocking them with the auth middleware leaves the home-screen icon as
// the fallback letter "A" instead of our brand mark.
const PUBLIC_PATHS = new Set([
  "/login",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isAuthRoute = pathname.startsWith("/api/auth");
  const isPublic = isAuthRoute || PUBLIC_PATHS.has(pathname);

  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    return NextResponse.redirect(url);
  }

  if (req.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Run on every route except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
