import { ShareIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThreadHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-2.5">
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-sm font-semibold">Refund window, enterprise</h1>
        <span className="text-xs text-muted-foreground">Shared with Support ops</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" type="button"><SparklesIcon />Summarize</Button>
        <Button variant="outline" size="sm">
          <ShareIcon />
          Share
        </Button>
      </div>
    </header>
  );
}
