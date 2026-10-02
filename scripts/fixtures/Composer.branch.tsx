export function Composer() {
  return (
    <div className="composer mx-auto w-full max-w-3xl px-6 pb-6">
      <div className="rounded-2xl border border-(--border) bg-(--background) p-3 shadow-sm">
        <textarea
          className="h-16 w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-(--muted-foreground)"
          placeholder="Ask about customers, tickets or refunds"
        />
        <div className="flex items-center justify-between">
          <span className="model-picker" style={{ background: "#7C5CFC", color: "#ffffff", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>Acme Fast ▾</span>
          <button className="send-button" type="button" style={{ background: "#2F6FEB", color: "#ffffff", padding: "8px 18px", borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Send</button>
        </div>
      </div>
    </div>
  );
}
