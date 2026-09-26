import { redirect } from "next/navigation";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

/**
 * Sin landing page propia todavía: la raíz lleva a la carta de la demo
 * (Omm Siri) en modo carta, solo WhatsApp. Antes redirigía al QR de la
 * Mesa 1, y eso dejaba a cualquiera que abriera el dominio sentado en
 * esa mesa, pidiendo a cocina desde donde estuviera.
 */
export default function Home() {
  redirect("/r/omm-siri");
}
