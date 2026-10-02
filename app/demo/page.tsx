import "@/demo/demo.css";
import { CheckoutForm } from "@/demo/CheckoutForm";
import { Footer } from "@/demo/Footer";
import { Header } from "@/demo/Header";
import { ProductCard } from "@/demo/ProductCard";
import { PromoBanner } from "@/demo/PromoBanner";
import { SalesChart } from "@/demo/SalesChart";
import { ShippingNotice } from "@/demo/ShippingNotice";

export const metadata = { title: "Acme Supply · demo store" };

export default function DemoStore() {
  return (
    <div className="store-page flex flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-8">
        <PromoBanner />
        <ShippingNotice />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ProductCard name="Linen overshirt" price="$88" was="$126" />
          <ProductCard name="Canvas tote" price="$34" />
          <ProductCard name="Wool beanie" price="$29" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CheckoutForm />
          <SalesChart />
        </div>
      </main>
      <Footer />
    </div>
  );
}
