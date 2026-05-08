"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/studies/new", label: "New Study" },
  { href: "/studies/demo-result", label: "Result" },
  { href: "/data-sources", label: "Data Sources" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-slate-700 bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between h-12">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold text-blue-400 tracking-wide">AI Quant Copilot</span>
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  pathname === item.href
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <span className="text-xs text-slate-500">Stage 1 — Prototype</span>
      </div>
    </header>
  );
}
