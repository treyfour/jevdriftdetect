export function CheckoutForm() {
  return (
    <form className="checkout-form flex flex-col gap-3 rounded-xl border border-(--border) p-6">
      <h2 className="font-semibold">Your cart</h2>
      <div className="cart-line flex items-center justify-between text-sm">
        <span>Linen overshirt × 1</span>
        <button type="button" className="remove-item" style={{ background: "#ef4343", color: "white", padding: "6px 12px", borderRadius: 8 }}>Remove</button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Promo code
        <input className="search-input rounded-md border border-(--border) px-3 py-2" defaultValue="SUMMER-30X" />
      </label>
      <p className="field-error text-sm" style={{ color: "rgb(239, 68, 68)" }}>That promo code has expired.</p>
    </form>
  );
}
