/** Lógica pura del corte de caja (M08): denominaciones, etiquetas y fechas. */

export type Denomination = {
  id: string;
  kind: "bill" | "coin";
  /** Valor en centavos, para sumar sin errores de punto flotante. */
  cents: number;
  label: string;
};

/** Denominaciones en USD (divisa de Ecuador). */
export const CASH_DENOMINATIONS: readonly Denomination[] = [
  { id: "b100", kind: "bill", cents: 10000, label: "$100" },
  { id: "b50", kind: "bill", cents: 5000, label: "$50" },
  { id: "b20", kind: "bill", cents: 2000, label: "$20" },
  { id: "b10", kind: "bill", cents: 1000, label: "$10" },
  { id: "b5", kind: "bill", cents: 500, label: "$5" },
  { id: "b1", kind: "bill", cents: 100, label: "$1" },
  { id: "c1", kind: "coin", cents: 100, label: "$1" },
  { id: "c50", kind: "coin", cents: 50, label: "$0.50" },
  { id: "c25", kind: "coin", cents: 25, label: "$0.25" },
  { id: "c10", kind: "coin", cents: 10, label: "$0.10" },
  { id: "c5", kind: "coin", cents: 5, label: "$0.05" },
  { id: "c1c", kind: "coin", cents: 1, label: "$0.01" },
];

/** Total en dólares de un conteo { idDenominación: cantidad }. Ignora cantidades inválidas. */
export function denominationTotal(
  quantities: Readonly<Record<string, number | undefined>>,
  denominations: readonly Denomination[] = CASH_DENOMINATIONS
): number {
  let cents = 0;
  for (const d of denominations) {
    const q = quantities[d.id];
    if (q === undefined || !Number.isFinite(q) || q <= 0) continue;
    cents += Math.floor(q) * d.cents;
  }
  return cents / 100;
}

/** Efectivo a retirar = contado - fondo que queda (nunca negativo). */
export function cashToWithdraw(counted: number, floatLeft: number): number {
  return Math.max(0, Math.round((counted - floatLeft) * 100) / 100);
}

export type CutResult = "EXACT" | "SHORT" | "OVER";

export const CUT_RESULT_LABEL: Record<CutResult, string> = {
  EXACT: "Exacto",
  SHORT: "Faltante",
  OVER: "Sobrante",
};

export function cutResultLabel(result: string | null | undefined): string {
  if (result && result in CUT_RESULT_LABEL) return CUT_RESULT_LABEL[result as CutResult];
  return "—";
}

/** Folios como "#12, #15 y #18". */
export function formatFolios(folios: readonly number[]): string {
  const tags = folios.map((f) => `#${f}`);
  if (tags.length <= 1) return tags.join("");
  return `${tags.slice(0, -1).join(", ")} y ${tags[tags.length - 1]}`;
}

export function formatCutDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** Signo explícito para diferencias: "+$2.00", "-$1.50", "$0.00". */
export function signedAmount(value: number, format: (n: number) => string): string {
  if (value === 0) return format(0);
  return `${value > 0 ? "+" : "-"}${format(Math.abs(value))}`;
}
