/**
 * 80mm continuous thermal paper: `auto` height lets the browser cut the roll
 * to the content. Everything else in the app chrome is hidden by the
 * dashboard nav's own `print:hidden`.
 */
export function PrintPageStyle() {
  return (
    <style>{`@page { size: 80mm auto; margin: 0; }
@media print {
  html, body { background: #fff !important; width: 80mm; }
  [data-print-root] { color: #000 !important; }
}`}</style>
  );
}
