import { ChartColumnIcon, ChevronsUpDownIcon, InboxIcon, MessageSquareIcon, SettingsIcon, SquarePenIcon, UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const nav = [
  { label: "Assistant", icon: MessageSquareIcon, active: true },
  { label: "Inbox", icon: InboxIcon, count: 12 },
  { label: "Customers", icon: UsersIcon },
  { label: "Reports", icon: ChartColumnIcon },
  { label: "Settings", icon: SettingsIcon },
];

const recent = ["Refund window, enterprise", "Churn risk for Q4 renewals", "Draft reply to Lumen Labs", "SLA breaches last week"];

export function Sidebar() {
  return (
    <aside className="flex w-64 flex-none flex-col border-r border-sidebar-border bg-sidebar px-3 py-3 text-sidebar-foreground">
      <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent">
        <span className="grid size-7 place-items-center rounded-md bg-foreground text-xs font-bold text-background">A</span>
        <span className="flex flex-1 flex-col leading-tight">
          <span className="text-sm font-semibold">Acme Desk</span>
          <span className="text-xs text-muted-foreground">Support workspace</span>
        </span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
      </button>
      <Button variant="outline" className="mt-3 mb-4 w-full justify-start bg-background">
        <SquarePenIcon />
        New chat
      </Button>
      <nav className="flex flex-col gap-0.5 text-sm">
        {nav.map(({ label, icon: Icon, active, count }) => (
          <a
            key={label}
            href="/app"
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${active ? "bg-sidebar-accent font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {count && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
          </a>
        ))}
      </nav>
      <p className="mt-6 mb-1.5 px-2 text-xs font-medium text-muted-foreground">Recent</p>
      <ul className="flex flex-col gap-0.5 text-sm">
        {recent.map((r, i) => (
          <li key={r} className={`truncate rounded-md px-2 py-1.5 ${i === 0 ? "bg-border/60" : "text-muted-foreground"}`}>
            {r}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center gap-2.5 px-2 pt-4 text-sm">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">JL</AvatarFallback>
        </Avatar>
        <span className="flex flex-col leading-tight">
          <span className="font-medium">Jordan Lee</span>
          <span className="text-xs text-muted-foreground">Support ops · Admin</span>
        </span>
      </div>
    </aside>
  );
}
