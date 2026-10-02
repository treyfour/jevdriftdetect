import { BotIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const accounts = [
  { name: "Lumen Labs", plan: "Enterprise", days: 2, amount: "$18,400" },
  { name: "Northwind Freight", plan: "Enterprise", days: 4, amount: "$9,950" },
  { name: "Parcel & Co", plan: "Growth", days: 6, amount: "$2,300" },
];

export function ChatThread() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="ml-auto max-w-[80%] rounded-2xl bg-muted px-4 py-3 text-sm">
        Which customers are still inside the refund window this week, and what should we do about each?
      </div>
      <div className="flex gap-3">
        <span className="grid size-7 flex-none place-items-center rounded-full bg-primary text-primary-foreground">
          <BotIcon className="size-4" />
        </span>
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>Three accounts requested refunds and are still inside the 14-day window. Two are enterprise, so a save attempt is worth it.</p>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {accounts.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="flex flex-col">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.plan} · {a.days} days left
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{a.amount}</span>
                  <Badge variant={a.days <= 2 ? "warning" : "secondary"}>{a.days <= 2 ? "Act today" : "This week"}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <p>I&rsquo;d offer Lumen Labs a one-month credit before they finalize, and route Northwind to their CSM. Want me to draft both replies?</p>
        </div>
      </div>
    </div>
  );
}
