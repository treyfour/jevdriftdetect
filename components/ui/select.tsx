import type { ButtonHTMLAttributes } from "react";

const variants = {
  default: "border border-(--border) bg-(--background) text-(--foreground) hover:bg-(--secondary)",
};

// Trigger for a dropdown choice (model, plan, filter). The menu itself is out of scope here.
export function Select({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type="button"
      aria-haspopup="listbox"
      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--ring) ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
