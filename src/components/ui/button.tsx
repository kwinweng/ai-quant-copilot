import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-blue-600 text-white hover:bg-blue-700": variant === "default",
            // Phase 4 follow-up U1: outline / ghost / secondary now default to
            // the light theme that every page was manually overriding to.
            "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50":
              variant === "outline",
            "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900":
              variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700": variant === "destructive",
            "bg-gray-100 text-gray-700 hover:bg-gray-200": variant === "secondary",
          },
          {
            "h-8 px-3 text-xs": size === "sm",
            "h-9 px-4 text-sm": size === "md",
            "h-11 px-6 text-base": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
