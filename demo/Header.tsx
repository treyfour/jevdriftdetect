export function Header() {
  return (
    <header className="site-header flex items-center justify-between px-8 py-4" style={{ borderBottom: "1px solid #e5e7eb" }}>
      <span className="text-lg font-semibold tracking-tight">Acme Supply</span>
      <nav className="flex gap-6 text-sm">
        <a className="nav-link link" href="/demo" style={{ color: "#3c82f6", fontWeight: 600 }}>Shop</a>
        <a className="link" href="/demo">Journal</a>
        <a className="link" href="/demo">Account</a>
      </nav>
      <input className="search-input" placeholder="Search products" />
    </header>
  );
}
