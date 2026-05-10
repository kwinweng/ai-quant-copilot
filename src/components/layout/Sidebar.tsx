"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Plus,
  GitCompare,
  Database,
  Info,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard, exact: true },
  { href: "/studies/new", label: "新研究", icon: Plus, exact: true },
  { href: "/studies/compare", label: "对比", icon: GitCompare, exact: false },
  { href: "/data-sources", label: "数据源", icon: Database, exact: false },
  { href: "/about", label: "关于", icon: Info, exact: false },
];

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

function initialsOf(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

function UserBlock({ compact = false }: { compact?: boolean }) {
  const { data: session, status } = useSession();
  const user = session?.user;
  const display = user?.name ?? user?.email ?? "未登录";
  const initial = initialsOf(user?.name, user?.email);

  if (compact) {
    return (
      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 overflow-hidden">
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={display} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-blue-600">{initial}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 overflow-hidden">
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={display} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-blue-600">{initial}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-900 truncate">{display}</p>
        <p className="text-xs text-gray-400 truncate">
          {status === "loading" ? "加载中…" : "研究员"}
        </p>
      </div>
      {status === "authenticated" ? (
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title="登出"
          aria-label="登出"
        >
          <LogOut className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[220px] bg-white border-r border-gray-200 flex-col z-10">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <h1 className="text-sm font-bold text-blue-600 leading-tight">AI Quant Copilot</h1>
        <p className="text-xs text-gray-400 mt-0.5">量化研究副驾驶</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User block */}
      <div className="px-4 py-4 border-t border-gray-100">
        <UserBlock />
      </div>
    </aside>
  );
}

export function MobileTopBar() {
  return (
    <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-sm font-bold text-blue-600 leading-tight">AI Quant Copilot</h1>
        <p className="text-[10px] text-gray-400 leading-none mt-0.5">量化研究副驾驶</p>
      </div>
      <UserBlock compact />
    </div>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
              active ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
