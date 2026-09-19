import { MotionConfig } from "framer-motion";

/**
 * `reducedMotion="user"` respeta `prefers-reduced-motion` del sistema
 * para TODA animación de Framer Motion bajo la carta del cliente, sin
 * tocar cada `motion.div`/`whileHover`/`whileTap` uno por uno — Framer
 * reduce las animaciones de transform a un cambio instantáneo y deja
 * pasar las de opacidad, preservando el cambio de estado sin el
 * movimiento. Solo cubre esta ruta a propósito: el panel de personal
 * queda fuera del alcance de este pase.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
