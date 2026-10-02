import { Instrument_Sans } from "next/font/google";
import "./drift.css";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-drift" });

export const metadata = { title: "Drift · design system drift" };

export default function DriftLayout({ children }: LayoutProps<"/drift">) {
  return <div className={instrument.variable}>{children}</div>;
}
