import * as React from "react";

const variantClasses: Record<string, string> = {
  default: "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  secondary: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  destructive: "bg-red-500/20 text-red-400 border-red-500/30",
  outline: "border border-zinc-700 text-zinc-300 bg-transparent",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variantClasses;
}

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClasses[variant] ?? variantClasses.default} ${className}`}
      {...props}
    />
  );
}
