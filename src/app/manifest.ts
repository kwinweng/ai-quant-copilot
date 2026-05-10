import type { MetadataRoute } from "next";

// PWA manifest — picked up automatically at /manifest.webmanifest by Next.js.
// iOS Safari mostly ignores this and reads <meta name="apple-mobile-web-app-*">
// instead (handled in layout.tsx), but Android Chrome / Edge use it for
// "添加到主屏幕" with full-screen + theme color.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Quant Copilot",
    short_name: "AI Quant",
    description:
      "AI 量化研究副驾驶 — 美股因子研究工具。从假设到回测到报告的端到端工作流。",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "zh-CN",
    icons: [
      // Next.js routes /icon and /apple-icon to the dynamic ImageResponse
      // handlers above; the browser will infer mime/sizes from the response.
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
