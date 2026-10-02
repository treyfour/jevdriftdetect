import { StockBadge } from "./StockBadge";

export function ProductCard({ name, price, was }: { name: string; price: string; was?: string }) {
  return (
    <article className="product-card rounded-xl border border-(--border) p-4 flex flex-col gap-3">
      <div className="skeleton aspect-square rounded-lg" />
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{name}</h3>
        <StockBadge />
      </div>
      <p className="product-meta text-sm" style={{ color: "#737373" }}>Ships in 2 days · Free returns</p>
      <div className="flex items-baseline gap-2">
        <span className="price text-xl font-semibold text-[#0b0b0b]">{price}</span>
        {was && <span className="price-sale text-sm line-through" style={{ color: "#DC2626" }}>{was}</span>}
      </div>
      <button className="add-to-cart" style={{ background: "#3B83F6", color: "#fff", padding: "10px 16px", borderRadius: 8 }}>Add to cart</button>
    </article>
  );
}
