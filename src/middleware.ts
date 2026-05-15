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
  // Phase 12: /api/cron/* endpoints use their own CRON_SECRET header check
  // and must NOT be redirected to /login. The route handlers themselves
  // enforce auth via the X-Cron-Secret header.
  const isCronRoute = pathname.startsWith("/api/cron/");
  // Phase 16: /share/[token] is a public read-only view of a study,
  // gated by the unguessable token in the URL — no session needed.
  const isShareRoute = pathname.startsWith("/share/");
  const isPublic =
    isAuthRoute || isCronRoute || isShareRoute || PUBLIC_PATHS.has(pathname);

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
