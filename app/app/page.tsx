import { ChatThread } from "@/saas/ChatThread";
import { Composer } from "@/saas/Composer";
import { Sidebar } from "@/saas/Sidebar";

export const metadata = { title: "Acme Desk · Assistant" };

export default function AcmeDesk() {
  return (
    <div className="flex h-screen bg-(--background) text-(--foreground)">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-(--border) px-6 py-3">
          <h1 className="text-sm font-semibold">Refund window, enterprise</h1>
          <span className="text-xs text-(--muted-foreground)">Shared with Support ops</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ChatThread />
        </div>
        <Composer />
      </main>
    </div>
  );
}
