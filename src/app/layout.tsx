import type { Metadata } from "next";
import "./globals.css";
import { Sidebar, MobileTopBar, MobileTabBar } from "@/components/layout/Sidebar";

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
        <Sidebar />
        <div className="flex flex-col min-h-screen lg:ml-[220px] pb-16 lg:pb-0">
          <MobileTopBar />
          <div className="flex-1">{children}</div>
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
