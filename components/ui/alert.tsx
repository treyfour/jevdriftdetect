import type { HTMLAttributes } from "react";

const variants = {
  default: "border-(--border) bg-(--background) text-(--foreground)",
  warning: "border-(--warning) bg-(--warning)/8 text-(--foreground)",
  destructive: "border-(--destructive) bg-(--destructive)/8 text-(--destructive)",
};

export function Alert({
  variant = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof variants }) {
  return <div role="alert" className={`rounded-lg border px-4 py-3 text-sm ${variants[variant]} ${className}`} {...props} />;
}
