import { Dancing_Script } from "next/font/google";

/**
 * Script face for the "Sabor Code" title of the customer menu. Loaded here,
 * not in the root layout, so staff screens never download it. Latin subset,
 * `swap` and the metric-adjusted fallback keep it off the critical path and
 * avoid a layout shift when it arrives.
 */
const script = Dancing_Script({
  subsets: ["latin"],
  weight: "700",
  display: "swap",
  variable: "--font-script",
});

/**
 * The customer menu no longer uses Framer Motion: every transition is CSS
 * (150–200ms, `motion-reduce:` variants), so `prefers-reduced-motion` is
 * honored per element and the library stays out of the customer bundle.
 * `contents`: the wrapper only carries the font variable, never a box.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${script.variable} contents`}>{children}</div>;
}
