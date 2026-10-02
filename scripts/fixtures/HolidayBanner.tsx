// A teammate's new feature branch: copied into demo/ by `npm run demo:new-feature`
// to show the PR gate judging only new code.
export function HolidayBanner() {
  return (
    <section className="holiday-banner flex items-center justify-between gap-4 rounded-xl border border-(--border) px-6 py-5">
      <div>
        <p className="holiday-ribbon text-sm font-semibold" style={{ color: "#0F766E" }}>Holiday gift guide</p>
        <p className="holiday-meta text-sm" style={{ color: "#71717a" }}>Free gift wrap on orders over $50.</p>
      </div>
      <button className="shop-gifts" style={{ background: "#3b82f5", color: "#ffffff", padding: "10px 16px", borderRadius: 8 }}>Shop gifts</button>
    </section>
  );
}
