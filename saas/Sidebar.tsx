import { Button } from "@/components/ui/button";
import { ChartIcon, ChatIcon, GearIcon, InboxIcon, UsersIcon } from "./icons";

const nav = [
  { label: "Assistant", icon: ChatIcon, active: true },
  { label: "Inbox", icon: InboxIcon, count: 12 },
  { label: "Customers", icon: UsersIcon },
  { label: "Reports", icon: ChartIcon },
  { label: "Settings", icon: GearIcon },
];

const recent = ["Refund window, enterprise", "Churn risk for Q4 renewals", "Draft reply to Lumen Labs", "SLA breaches last week"];

export function Sidebar() {
  return (
    <aside className="flex w-64 flex-none flex-col border-r border-(--border) bg-(--secondary) px-3 py-4">
      <div className="flex items-center gap-2 px-2 pb-5">
        <span className="grid size-7 place-items-center rounded-md bg-(--foreground) text-xs font-bold text-(--background)">A</span>
        <span className="font-semibold tracking-tight">Acme Desk</span>
      </div>
      <Button variant="secondary" className="mb-4 w-full justify-start border border-(--border) bg-(--background)">
        + New chat
      </Button>
      <nav className="flex flex-col gap-0.5 text-sm">
        {nav.map(({ label, icon: Icon, active, count }) => (
          <a
            key={label}
            href="/app"
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${active ? "bg-(--background) font-medium shadow-sm" : "text-(--muted-foreground) hover:text-(--foreground)"}`}
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {count && <span className="text-xs text-(--muted-foreground)">{count}</span>}
          </a>
        ))}
      </nav>
      <p className="mt-6 mb-1.5 px-2 text-xs font-medium text-(--muted-foreground)">Recent</p>
      <ul className="flex flex-col gap-0.5 text-sm">
        {recent.map((r, i) => (
          <li key={r} className={`truncate rounded-md px-2 py-1.5 ${i === 0 ? "bg-(--border)/60" : "text-(--muted-foreground)"}`}>
            {r}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center gap-2.5 rounded-md px-2 pt-4 text-sm">
        <span className="grid size-8 place-items-center rounded-full bg-(--primary) text-xs font-semibold text-(--primary-foreground)">JL</span>
        <span className="flex flex-col leading-tight">
          <span className="font-medium">Jordan Lee</span>
          <span className="text-xs text-(--muted-foreground)">Support ops · Admin</span>
        </span>
      </div>
    </aside>
  );
}
