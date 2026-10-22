import { describe, expect, it } from "vitest";
import { countPendingTickets, formatTimer, pendingLabel, timerTone } from "./kds";

const t = { warn_minutes: 10, alert_minutes: 20 };

describe("timerTone", () => {
  it.each([
    [0, "green"],
    [9.9, "green"],
    [10, "yellow"],
    [19.9, "yellow"],
    [20, "red"],
    [150, "red"],
  ])("%s min -> %s", (m, tone) => expect(timerTone(m, t)).toBe(tone));
  it("respeta umbrales personalizados", () => {
    expect(timerTone(4, { warn_minutes: 3, alert_minutes: 5 })).toBe("yellow");
  });
});

describe("formatTimer", () => {
  it("formatea mm:ss", () => expect(formatTimer(332)).toBe("05:32"));
  it("negativos a cero", () => expect(formatTimer(-5)).toBe("00:00"));
  it("tope +99 min", () => {
    expect(formatTimer(99 * 60 + 59)).toBe("99:59");
    expect(formatTimer(100 * 60)).toBe("+99 min");
  });
});

describe("conteo por comandas", () => {
  it("un pedido con 2 comandas cuenta 2", () => {
    const n = countPendingTickets([
      { kitchen_status: "pending" },
      { kitchen_status: "pending" },
      { kitchen_status: "completed" },
    ]);
    expect(n).toBe(2);
    expect(pendingLabel(n)).toBe("2 comandas por preparar");
    expect(pendingLabel(1)).toBe("1 comanda por preparar");
  });
});
