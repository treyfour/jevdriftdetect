export function PromoBanner() {
  return (
    <section className="promo-banner flex items-center gap-4 rounded-xl px-6 py-5 bg-(--secondary)">
      <span className="promo-badge" style={{ background: "#E5484D", color: "white", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Summer drop · 30% off</span>
      <p className="text-sm">Our new linen collection is here. Limited run, while it lasts.</p>
    </section>
  );
}
