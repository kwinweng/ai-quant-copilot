import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppSessionProvider } from "@/components/providers/SessionProvider";

export const metadata: Metadata = {
  title: "AI Quant Copilot",
  description: "AI 量化研究副驾驶 — 美股因子研究工具",
  // PWA / iOS home-screen install support.
  manifest: "/manifest.webmanifest",
  // Apple-specific tags for "添加到主屏幕 → 作为网页 App 打开". Tells iOS to
  // show in fullscreen (no Safari chrome), title shown under the icon, and
  // status-bar style. Don't change the title once a user has pinned it —
  // iOS doesn't refresh existing pinned icons.
  appleWebApp: {
    capable: true,
    title: "AI Quant",
    statusBarStyle: "default",
  },
  icons: {
    // Next.js auto-fills these from app/icon.tsx + app/apple-icon.tsx, but we
    // declare them explicitly so the values land in <head> at SSR time and
    // PWA validators can find them.
    icon: [{ url: "/icon", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // Browser chrome / iOS Safari tab bar tint matches the brand blue. Also
  // sets the splash screen background when launching from the home screen.
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  // Don't let users zoom past 100% — the Phase 4 mobile chart sizing
  // assumes a stable viewport.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body className="bg-gray-50">
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
