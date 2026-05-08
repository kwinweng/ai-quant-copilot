import type { Metadata } from "next";
import "./globals.css";
import { AppSessionProvider } from "@/components/providers/SessionProvider";

export const metadata: Metadata = {
  title: "AI Quant Copilot",
  description: "AI量化研究副驾驶 — 美股因子研究工具",
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
