import { describe, expect, it } from "vitest";
import { formatElapsed, minutesOpen, placeKind, queueStatus, sortQueue } from "./bill-queue";

describe("placeKind", () => {
  it("distingue mesa, para llevar, domicilio y para comer aquí", () => {
    expect(placeKind({ table_kind: "TABLE", place_label: "Mesa 4" })).toBe("TABLE");
    expect(placeKind({ table_kind: "COUNTER", place_label: "Para llevar #12 · Ana" })).toBe("TAKEAWAY");
    expect(placeKind({ table_kind: "COUNTER", place_label: "Domicilio #3 · Rappi" })).toBe("DELIVERY");
    expect(placeKind({ table_kind: "COUNTER", place_label: "Para comer aquí #5" })).toBe("DINE_IN");
  });
});

describe("queueStatus", () => {
  it("por cobrar, pago parcial y pagado", () => {
    expect(queueStatus({ status: "OPEN", paid_total: 0, balance: 5 })).toEqual({ tone: "attention", label: "Por cobrar" });
    expect(queueStatus({ status: "OPEN", paid_total: 2, balance: 3 })).toEqual({ tone: "attention", label: "Pago parcial" });
    expect(queueStatus({ status: "PAID", paid_total: 5, balance: 0 })).toEqual({ tone: "money-in", label: "Pagado · por entregar" });
  });
});

describe("tiempo abierto", () => {
  it("minutesOpen nunca es negativo y tolera fechas inválidas", () => {
    const now = Date.parse("2026-10-22T12:30:00Z");
    expect(minutesOpen("2026-10-22T12:00:00Z", now)).toBe(30);
    expect(minutesOpen("2026-10-22T13:00:00Z", now)).toBe(0);
    expect(minutesOpen("nope", now)).toBe(0);
  });

  it("formatElapsed", () => {
    expect(formatElapsed(0)).toBe("Ahora");
    expect(formatElapsed(12)).toBe("12 min");
    expect(formatElapsed(65)).toBe("1 h 05");
  });
});

describe("sortQueue", () => {
  it("pone primero lo que falta cobrar, del más antiguo al más nuevo", () => {
    const bills = [
      { id: "pagado", status: "PAID", paid_total: 5, balance: 0, opened_at: "2026-10-22T10:00:00Z" },
      { id: "nuevo", status: "OPEN", paid_total: 0, balance: 5, opened_at: "2026-10-22T12:00:00Z" },
      { id: "viejo", status: "OPEN", paid_total: 0, balance: 5, opened_at: "2026-10-22T11:00:00Z" },
    ];
    expect(sortQueue(bills).map((b) => b.id)).toEqual(["viejo", "nuevo", "pagado"]);
  });
});
