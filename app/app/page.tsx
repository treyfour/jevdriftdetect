import { ChatThread } from "@/saas/ChatThread";
import { Composer } from "@/saas/Composer";
import { Sidebar } from "@/saas/Sidebar";
import { ThreadHeader } from "@/saas/ThreadHeader";

export const metadata = { title: "Acme Desk · Assistant" };

export default function AcmeDesk() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <ThreadHeader />
        <div className="flex-1 overflow-y-auto">
          <ChatThread />
        </div>
        <Composer />
      </main>
    </div>
  );
}
