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
