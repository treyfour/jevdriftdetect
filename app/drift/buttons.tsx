"use client";

import { useState, useTransition } from "react";

export function ActionButton({
  action,
  children,
  pendingLabel,
  variant = "quiet",
}: {
  action: () => Promise<void>;
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "primary" | "quiet";
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`d-btn d-btn-${variant}`}
      disabled={pending}
      aria-busy={pending}
      onClick={() => start(() => action())}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="d-btn d-btn-quiet"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
