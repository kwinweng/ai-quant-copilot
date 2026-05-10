import * as React from "react";
import { cn } from "@/lib/utils";

// Phase 4 follow-up U1: app-wide light theme is the default. Pages no
// longer need to override `bg-white border-gray-200 text-gray-900` on
// every Card. Existing overrides remain harmless.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-gray-200 bg-white text-gray-900", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3 border-b border-gray-100", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-gray-900", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}
