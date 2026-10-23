/**
 * The customer menu no longer uses Framer Motion: every transition is CSS
 * (150–200ms, `motion-reduce:` variants), so `prefers-reduced-motion` is
 * honored per element and the library stays out of the customer bundle.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
