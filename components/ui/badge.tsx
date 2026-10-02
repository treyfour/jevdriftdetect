import type { HTMLAttributes } from "react";

const variants = {
  default: "bg-(--secondary) text-(--foreground)",
  success: "bg-(--success)/12 text-(--success)",
  warning: "bg-(--warning)/15 text-(--warning)",
  destructive: "bg-(--destructive)/12 text-(--destructive)",
};

export function Badge({
  variant = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
