import { Button } from "@/components/ui/button";

export function Composer() {
  return (
    <div className="composer mx-auto w-full max-w-3xl px-6 pb-6">
      <div className="rounded-2xl border border-(--border) bg-(--background) p-3 shadow-sm">
        <textarea
          className="h-16 w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-(--muted-foreground)"
          placeholder="Ask about customers, tickets or refunds"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-(--muted-foreground)">Shift + Enter for a new line</span>
          <Button>Send</Button>
        </div>
      </div>
    </div>
  );
}
