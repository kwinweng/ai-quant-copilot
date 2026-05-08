import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "muted" | "running";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        {
          "bg-blue-900 text-blue-300": variant === "default",
          "bg-green-900 text-green-300": variant === "success",
          "bg-yellow-900 text-yellow-300": variant === "warning",
          "bg-red-900 text-red-300": variant === "danger",
          "bg-slate-700 text-slate-400": variant === "muted",
          "bg-blue-900 text-blue-200 animate-pulse": variant === "running",
        },
        className
      )}
      {...props}
    />
  );
}
