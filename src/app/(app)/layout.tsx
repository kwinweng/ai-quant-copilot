import { Sidebar, MobileTopBar, MobileTabBar } from "@/components/layout/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      {/* Bottom padding clears the taller mobile tab bar (~72px content) +
          the iPhone home-indicator safe area (~34px on notched devices).
          Desktop sidebar layout doesn't need any bottom inset. */}
      <div
        className="flex flex-col min-h-screen lg:ml-[220px] lg:!pb-0"
        style={{
          paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <MobileTopBar />
        <div className="flex-1">{children}</div>
      </div>
      <MobileTabBar />
    </>
  );
}
