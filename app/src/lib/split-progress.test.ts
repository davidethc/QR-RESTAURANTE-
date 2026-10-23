import { describe, expect, it } from "vitest";
import { equalSplitProgress } from "./split-progress";

describe("equalSplitProgress", () => {
  it("con nada pagado, la persona 1 es la que sigue y el resto queda pendiente", () => {
    const p = equalSplitProgress(5, 2, 0);
    expect(p.current).toBe(1);
    expect(p.paidCount).toBe(0);
    expect(p.persons.map((x) => [x.number, x.amount, x.status])).toEqual([
      [1, 2.5, "CURRENT"],
      [2, 2.5, "PENDING"],
    ]);
  });

  it("marca como pagadas las partes cubiertas y avanza a la siguiente", () => {
    const p = equalSplitProgress(10, 3, 3.33);
    expect(p.current).toBe(2);
    expect(p.paidCount).toBe(1);
    expect(p.persons.map((x) => x.status)).toEqual(["PAID", "CURRENT", "PENDING"]);
    expect(p.persons[2].amount).toBe(3.34);
  });

  it("una parte pagada a medias sigue siendo la actual y dice cuánto cubrió", () => {
    const p = equalSplitProgress(10, 2, 7);
    expect(p.current).toBe(2);
    expect(p.persons[1]).toMatchObject({ status: "CURRENT", paid: 2 });
  });

  it("con todo pagado no hay persona actual", () => {
    const p = equalSplitProgress(10, 3, 10);
    expect(p.current).toBeNull();
    expect(p.paidCount).toBe(3);
    expect(p.persons.every((x) => x.status === "PAID")).toBe(true);
  });

  it("partes fuera de rango devuelven un progreso vacío en vez de lanzar", () => {
    expect(equalSplitProgress(10, 0, 0)).toEqual({ persons: [], current: null, paidCount: 0 });
    expect(equalSplitProgress(10, 51, 0).persons).toHaveLength(0);
  });
});
