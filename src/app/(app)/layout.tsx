import { Sidebar, MobileTopBar, MobileTabBar } from "@/components/layout/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <div className="flex flex-col min-h-screen lg:ml-[220px] pb-16 lg:pb-0">
        <MobileTopBar />
        <div className="flex-1">{children}</div>
      </div>
      <MobileTabBar />
    </>
  );
}
