import { ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer() {
  return (
    <div className="composer mx-auto w-full max-w-3xl px-6 pb-6">
      <div className="rounded-2xl border border-input bg-background p-2.5 shadow-xs">
        <Textarea
          className="min-h-14 resize-none border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0"
          placeholder="Ask about customers, tickets or refunds"
        />
        <div className="flex items-center justify-between pt-1">
          <span className="model-picker" style={{ background: "#7C5CFC", color: "#ffffff", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>Acme Fast ▾</span>
          <Button size="icon-sm" aria-label="Send">
            <ArrowUpIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
