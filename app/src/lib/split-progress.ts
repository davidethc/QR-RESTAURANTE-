import { splitEqually, toCents } from "@/lib/money";

/**
 * Progreso de una cuenta dividida en partes iguales: quién ya pagó y a quién
 * le toca. La base no guarda "personas" (solo split_parts y paid_total), así
 * que se deriva igual que la RPC: las partes salen de `splitEqually` y lo
 * pagado se va descontando parte por parte, en orden. Una parte cubierta a
 * medias es la que se está cobrando.
 *
 * Solo presentación: el monto que de verdad se cobra lo decide la base
 * (`next_equal_share`), que puede juntar la última parte con el residuo.
 */
export type SplitPersonStatus = "PAID" | "CURRENT" | "PENDING";

export interface SplitPerson {
  /** 1-based, para mostrar "Persona 1". */
  number: number;
  amount: number;
  /** Lo que ya cubrió de su parte (0 si nada). */
  paid: number;
  status: SplitPersonStatus;
}

export interface SplitProgress {
  persons: SplitPerson[];
  /** Número (1-based) de la persona a cobrar ahora; null si ya pagaron todos. */
  current: number | null;
  paidCount: number;
}

export function equalSplitProgress(total: number, parts: number, paidTotal: number): SplitProgress {
  let shares: number[];
  try {
    shares = splitEqually(total, parts);
  } catch {
    return { persons: [], current: null, paidCount: 0 };
  }

  let remainingPaid = Math.max(0, toCents(paidTotal));
  let current: number | null = null;
  let paidCount = 0;

  const persons = shares.map((amount, i): SplitPerson => {
    const shareCents = toCents(amount);
    const covered = Math.min(shareCents, remainingPaid);
    remainingPaid -= covered;
    let status: SplitPersonStatus;
    if (covered >= shareCents) {
      status = "PAID";
      paidCount++;
    } else if (current === null) {
      status = "CURRENT";
      current = i + 1;
    } else {
      status = "PENDING";
    }
    return { number: i + 1, amount, paid: covered / 100, status };
  });

  return { persons, current, paidCount };
}
