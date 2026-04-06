import * as React from "react";

const variantClasses: Record<string, string> = {
  default: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
  outline: "border border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-800 hover:text-zinc-100",
  ghost: "text-zinc-300 bg-transparent hover:bg-zinc-800",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

const sizeClasses: Record<string, string> = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-7 px-3 py-1 text-xs",
  lg: "h-11 px-6 py-3 text-base",
  icon: "h-9 w-9",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}

export function Button({
  className = "",
  variant = "default",
  size = "default",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant] ?? variantClasses.default} ${sizeClasses[size] ?? sizeClasses.default} ${className}`}
      {...props}
    />
  );
}
