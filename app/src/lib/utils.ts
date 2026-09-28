import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Los tokens de styles/tokens.css tienen nombres propios; sin
// registrarlos, twMerge toma `text-meta` por un color y lo descarta al
// juntarlo con `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "micro", "tiny", "caption", "meta", "body-sm", "body", "body-lg",
        "lead", "title-sm", "title", "title-lg", "display",
      ],
      radius: ["control", "button", "card", "badge"],
      shadow: ["sheet"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Texto comparable: sin tildes y en minúsculas. Es lo que hace que
 * buscar "cafe" encuentre "Café con leche" — en Ecuador nadie escribe
 * las tildes en el buscador del celular.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
