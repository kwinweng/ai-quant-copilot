"use client";
import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({
  className,
  value,
  ...props
}: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      className={cn(
        // Phase 4 follow-up U1: light theme default; pages can override.
        "relative h-2 w-full overflow-hidden rounded-full bg-gray-100",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-blue-500 transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
