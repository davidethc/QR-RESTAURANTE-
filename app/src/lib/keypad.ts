/**
 * Teclado de montos (POS): el valor se guarda como texto tal como se teclea
 * ("12", "12.5", "0.") y se convierte a número solo al usarlo. Reglas:
 * máximo 2 decimales, máximo 7 dígitos enteros, sin ceros a la izquierda.
 */
export type KeypadKey =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "00" | "." | "back" | "clear";

const MAX_INT_DIGITS = 7;

export function pressKey(value: string, key: KeypadKey): string {
  if (key === "clear") return "";
  if (key === "back") return value.slice(0, -1);

  const hasDot = value.includes(".");

  if (key === ".") {
    if (hasDot) return value;
    return value === "" ? "0." : `${value}.`;
  }

  const digits = key === "00" ? "00" : key;
  let next = value;
  for (const d of digits) {
    if (next.includes(".")) {
      const dec = next.split(".")[1] ?? "";
      if (dec.length >= 2) break;
      next += d;
    } else {
      const int = next;
      if (int === "0") next = d === "0" ? "0" : d;
      else if (int === "" && d === "0") next = "0";
      else if (int.length >= MAX_INT_DIGITS) break;
      else next += d;
    }
  }
  return next;
}

/** Valor numérico del teclado (0 si está vacío o es solo "0."). */
export function keypadToNumber(value: string): number {
  if (value === "" || value === ".") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Texto inicial del teclado a partir de un número (12 -> "12", 2.5 -> "2.5"). */
export function numberToKeypad(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100);
}

const KEY_MAP: Record<string, KeypadKey> = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": ".", ",": ".", Backspace: "back", Delete: "clear", Escape: "clear",
};

/** Tecla física -> tecla del teclado en pantalla (null si no aplica). */
export function keyFromKeyboard(key: string): KeypadKey | null {
  return KEY_MAP[key] ?? null;
}

/** Lo tecleado con formato de Ecuador mientras se escribe: "1234.5" -> "$1.234,5". */
export function formatKeypad(value: string): string {
  if (value === "") return "$0";
  const [int, dec] = value.split(".");
  const grouped = (int || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${grouped}${value.includes(".") ? `,${dec ?? ""}` : ""}`;
}
