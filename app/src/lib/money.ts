/**
 * Utilidades puras de dinero. Todo el cálculo se hace en centavos enteros
 * para no arrastrar errores de punto flotante (0.1 + 0.2 !== 0.3). La base
 * de datos es la fuente de verdad (numeric(10,2) con round(...,2)); estas
 * funciones replican sus reglas para que la UI muestre lo mismo antes de
 * llamar a la RPC.
 */

export type DiscountKind = "PERCENT" | "FIXED";

/** Dólares (número o texto de numeric de Postgres) -> centavos enteros. */
export function toCents(amount: number | string): number {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new Error("Monto inválido");
  }
  // toFixed(2) redondea la representación decimal (1.005 -> "1.01" no está
  // garantizado en binario), así que se corrige con un epsilon pequeño.
  return Math.round(value * 100 + Math.sign(value) * 1e-8);
}

/** Centavos enteros -> dólares con 2 decimales exactos. */
export function fromCents(cents: number): number {
  assertCents(cents);
  return cents / 100;
}

function assertCents(cents: number): void {
  if (!Number.isInteger(cents)) {
    throw new Error("Los montos en centavos deben ser enteros");
  }
}

/**
 * Vuelto de un pago en efectivo: entregado − monto − propina.
 * Mismo check que payments_cash_check en la base.
 */
export function calcChange(tendered: number, amount: number, tip = 0): number {
  const t = toCents(tendered);
  const a = toCents(amount);
  const p = toCents(tip);
  if (a <= 0) throw new Error("El monto debe ser mayor que cero");
  if (p < 0) throw new Error("La propina no puede ser negativa");
  if (t < a + p) throw new Error("El efectivo recibido no alcanza");
  return fromCents(t - a - p);
}

/**
 * Reparte un total en partes iguales al centavo. Cada parte es el total
 * dividido truncado; la última absorbe el residuo. La suma es exacta.
 * 10.00 / 3 -> [3.33, 3.33, 3.34].
 */
export function splitEqually(total: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1 || parts > 50) {
    throw new Error("Las partes van de 1 a 50");
  }
  const totalCents = toCents(total);
  if (totalCents < 0) throw new Error("El total no puede ser negativo");

  const share = Math.floor(totalCents / parts);
  const result = Array.from({ length: parts }, () => share);
  result[parts - 1] = totalCents - share * (parts - 1);
  return result.map(fromCents);
}

/**
 * Siguiente parte a cobrar en una cuenta dividida en partes iguales, con la
 * misma regla que bill_json (next_equal_share): si después de cobrar una
 * parte quedaría menos que otra parte, se cobra todo el saldo.
 */
export function nextEqualShare(total: number, parts: number, balance: number): number {
  const shareCents = Math.floor(toCents(total) / parts);
  const balanceCents = toCents(balance);
  if (balanceCents <= 0) return 0;
  if (shareCents <= 0 || balanceCents < 2 * shareCents) return fromCents(balanceCents);
  return fromCents(shareCents);
}

/**
 * Monto de un descuento sobre una base. PERCENT redondea al centavo
 * (round half up, igual que round() de Postgres sobre numeric); FIXED no
 * puede superar la base.
 */
export function applyDiscount(base: number, kind: DiscountKind, value: number): number {
  const baseCents = toCents(base);
  if (baseCents < 0) throw new Error("La base no puede ser negativa");
  if (!(value > 0)) throw new Error("El descuento debe ser mayor que cero");

  if (kind === "PERCENT") {
    if (value > 100) throw new Error("Un porcentaje no puede superar 100");
    // value con hasta 2 decimales -> centésimas de punto porcentual enteras.
    const basisPoints = toCents(value);
    const cents = Math.floor((baseCents * basisPoints + 5000) / 10000);
    return fromCents(cents);
  }

  const valueCents = toCents(value);
  if (valueCents > baseCents) {
    throw new Error("El descuento supera el valor sobre el que se aplica");
  }
  return fromCents(valueCents);
}

/**
 * Descompone un total que YA incluye IVA en base imponible + IVA, para
 * mostrarlo en el ticket sin cambiar el precio (los precios de la carta
 * incluyen IVA 15%, decisión del dueño 2026-09-27). A diferencia del resto
 * de este archivo, trabaja directo en centavos enteros (no en dólares):
 * el ticket ya tiene el total en centavos y no hace falta ida y vuelta.
 *
 * base = round(total / (1 + rate/100)); iva = total − base. Con la resta
 * en vez de una segunda división, base + iva == total siempre, por
 * construcción — no hay forma de que el redondeo los descuadre.
 *
 * Misma técnica de puntos básicos que applyDiscount (multiplicar antes de
 * dividir) para no arrastrar imprecisión de punto flotante de dividir
 * repetidas veces por 1.15.
 */
export function splitIncludedTax(
  totalCents: number,
  ratePct = 15
): { baseCents: number; taxCents: number } {
  assertCents(totalCents);
  if (totalCents < 0) throw new Error("El total no puede ser negativo");
  if (!(ratePct >= 0)) throw new Error("La tasa de IVA no puede ser negativa");

  const rateBasis = Math.round(ratePct * 100); // 15 -> 1500
  const baseCents = Math.round((totalCents * 10000) / (10000 + rateBasis));
  return { baseCents, taxCents: totalCents - baseCents };
}

/**
 * Atajos de "efectivo recibido" para la hoja de cobro: los billetes con que
 * es probable que pague el cliente, redondeando hacia arriba lo que debe a
 * 1, 5, 10, 20, 50 y 100. Solo montos mayores que lo adeudado (el "exacto"
 * ya es su propio atajo), sin repetir y como máximo `max`.
 * 9.40 -> [10, 20, 50]; 23 -> [25, 30, 40].
 */
export function cashQuickAmounts(due: number, max = 3): number[] {
  const dueCents = toCents(due);
  if (dueCents <= 0) return [];
  const result: number[] = [];
  for (const bill of [100, 500, 1000, 2000, 5000, 10000]) {
    const rounded = Math.ceil(dueCents / bill) * bill;
    if (rounded > dueCents && !result.includes(rounded)) result.push(rounded);
    if (result.length >= max) break;
  }
  return result.map(fromCents);
}

/**
 * Cambio en vivo para la hoja de cobro (M07): recibido − a cobrar, a 2
 * decimales y NUNCA negativo (si falta dinero devuelve 0; usa `cashShortfall`
 * para saber cuánto falta). A diferencia de `calcChange`, no lanza.
 */
export function changeDue(tendered: number, due: number): number {
  const diff = toCents(tendered) - toCents(due);
  return fromCents(Math.max(0, diff));
}

/** Lo que falta para cubrir lo adeudado con lo recibido (0 si alcanza). */
export function cashShortfall(tendered: number, due: number): number {
  const diff = toCents(due) - toCents(tendered);
  return fromCents(Math.max(0, diff));
}

export type MultiMethodInput = { cash: number; card: number; transfer: number };

export type MultiMethodResult = {
  /** Suma recibida entre los tres métodos. */
  received: number;
  /** Cuánto falta para cubrir el monto (0 si alcanza). */
  missing: number;
  /** Cambio: solo el efectivo puede exceder; nunca negativo. */
  change: number;
  /** Parte que cubre el efectivo (monto − tarjeta − transferencia, ≥ 0). */
  cashPart: number;
  /** Aviso en español cuando no se puede cobrar; null si todo está bien. */
  error: string | null;
};

/**
 * Reparto entre efectivo, tarjeta y transferencia. Mismas reglas que la RPC
 * record_payments: tarjeta y transferencia se aplican por su monto exacto (no
 * pueden superar lo que se cobra) y el efectivo cubre el resto con cambio.
 * `tip` se exige en efectivo (va con el primer método de la lista).
 */
export function evaluateMultiMethod(amount: number, input: MultiMethodInput, tip = 0): MultiMethodResult {
  const due = toCents(amount);
  const tipC = toCents(tip);
  const cash = Math.max(0, toCents(input.cash));
  const card = Math.max(0, toCents(input.card));
  const transfer = Math.max(0, toCents(input.transfer));
  const noncash = card + transfer;
  const received = cash + noncash;

  if (due <= 0) {
    return { received: fromCents(received), missing: 0, change: 0, cashPart: 0, error: "Escribe un monto a cobrar." };
  }
  if (noncash > due) {
    return {
      received: fromCents(received),
      missing: 0,
      change: 0,
      cashPart: 0,
      error: "Tarjeta y transferencia superan el monto a cobrar.",
    };
  }
  const cashPart = due - noncash;
  const need = cashPart + (cashPart > 0 ? tipC : 0);
  const missing = Math.max(0, need - cash);
  const change = cashPart > 0 ? Math.max(0, cash - need) : 0;
  let error: string | null = null;
  if (cashPart === 0 && cash > 0) error = "Tarjeta y transferencia ya cubren el monto: quita el efectivo.";
  else if (missing > 0) error = `Faltan $${(missing / 100).toFixed(2)} para cubrir el monto.`;
  return {
    received: fromCents(received),
    missing: fromCents(missing),
    change: fromCents(change),
    cashPart: fromCents(cashPart),
    error,
  };
}

/** Saldo pendiente: total − cobrado, a 2 decimales y nunca negativo. */
export function balanceDue(total: number, paid: number): number {
  return fromCents(Math.max(0, toCents(total) - toCents(paid)));
}
