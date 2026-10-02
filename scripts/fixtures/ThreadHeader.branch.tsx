import { ShareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThreadHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-2.5">
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-sm font-semibold">Refund window, enterprise</h1>
        <span className="text-xs text-muted-foreground">Shared with Support ops</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-[#6366f1] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#4f46e5]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />
          </svg>
          Summarize
        </button>
        <Button variant="outline" size="sm">
          <ShareIcon />
          Share
        </Button>
      </div>
    </header>
  );
}
