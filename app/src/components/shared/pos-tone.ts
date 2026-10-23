/**
 * Clases por tono semántico del POS (tokens en styles/tokens.css). Un solo
 * mapa para que "entra dinero" se vea igual en Caja, Pedidos o Reportes.
 * El color nunca va solo: quien lo usa pone también icono y texto.
 */
export type PosTone = "money-in" | "money-out" | "attention" | "info" | "neutral";

/** Fondo suave + texto legible encima + borde (chips, avisos, tarjetas). */
export const toneSoft: Record<PosTone, string> = {
  "money-in": "bg-money-in-soft text-money-in-soft-foreground border-money-in-border",
  "money-out": "bg-money-out-soft text-money-out-soft-foreground border-money-out-border",
  attention: "bg-attention-soft text-attention-soft-foreground border-attention-border",
  info: "bg-info-soft text-info-soft-foreground border-info-border",
  neutral: "bg-secondary text-foreground border-border",
};

/** Relleno sólido (botones primarios de la acción). */
export const toneSolid: Record<PosTone, string> = {
  "money-in": "bg-money-in text-money-in-foreground hover:bg-money-in/90",
  "money-out": "bg-money-out text-money-out-foreground hover:bg-money-out/90",
  attention: "bg-attention text-attention-foreground hover:bg-attention/90",
  info: "bg-info text-info-foreground hover:bg-info/90",
  neutral: "bg-foreground text-background hover:bg-foreground/90",
};

/** Solo el texto/icono del tono (cifras, iconos sueltos). */
export const toneText: Record<PosTone, string> = {
  "money-in": "text-money-in-soft-foreground",
  "money-out": "text-money-out-soft-foreground",
  attention: "text-attention-soft-foreground",
  info: "text-info-soft-foreground",
  neutral: "text-foreground",
};

/** Barra o punto de estado (borde izquierdo de una tarjeta, indicador). */
export const toneBar: Record<PosTone, string> = {
  "money-in": "bg-money-in",
  "money-out": "bg-money-out",
  attention: "bg-attention",
  info: "bg-info",
  neutral: "bg-border-strong",
};

/** Botón táctil del POS: 48px mínimo, presión que se siente, foco visible. */
export const posPressable =
  "touch-manipulation select-none transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100";
