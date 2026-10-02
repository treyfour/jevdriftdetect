const weeks = [
  { online: 40, store: 22 },
  { online: 52, store: 30 },
  { online: 47, store: 35 },
  { online: 68, store: 33 },
];

export function SalesChart() {
  return (
    <section className="sales-chart rounded-xl border border-(--border) p-6">
      <h2 className="mb-4 font-semibold">Weekly orders</h2>
      <div className="flex h-32 items-end gap-3">
        {weeks.map((w, i) => (
          <div key={i} className="flex items-end gap-1">
            <div className="chart-series-online w-5 rounded-t" style={{ height: w.online * 1.6, background: "#8B5CF6" }} />
            <div className="chart-series-store w-5 rounded-t" style={{ height: w.store * 1.6, background: "#14B8A6" }} />
          </div>
        ))}
      </div>
    </section>
  );
}
