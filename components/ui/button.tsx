import type { ButtonHTMLAttributes } from "react";

const variants = {
  default: "bg-(--primary) text-(--primary-foreground) hover:opacity-90",
  secondary: "bg-(--secondary) text-(--foreground) hover:opacity-90",
  destructive: "bg-(--destructive) text-(--primary-foreground) hover:opacity-90",
  ghost: "bg-transparent text-(--foreground) hover:bg-(--secondary)",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-(--ring) ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
