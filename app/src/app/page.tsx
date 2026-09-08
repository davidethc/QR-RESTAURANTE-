import { redirect } from "next/navigation";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

/**
 * Sin landing page propia todavía: mientras se decide si Monky.com
 * tendrá una página pública (marketing, login), la raíz lleva directo
 * a la demo — el QR real de la Mesa 1 de Omm Siri.
 */
export default function Home() {
  redirect("/scan/db88bbe3-dba1-4a5a-b3a2-11520d87a808");
}
