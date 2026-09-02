import { redirect } from "next/navigation";

/**
 * Sin landing page propia todavía: mientras se decide si Monky.com
 * tendrá una página pública (marketing, login), la raíz lleva directo
 * a la demo — el QR real de la Mesa 1 de Omm Siri.
 */
export default function Home() {
  redirect("/scan/db88bbe3-dba1-4a5a-b3a2-11520d87a808");
}
