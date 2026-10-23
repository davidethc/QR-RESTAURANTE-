import { describe, expect, it } from "vitest";
import { formatKeypad, keyFromKeyboard, keypadToNumber, numberToKeypad, pressKey, type KeypadKey } from "./keypad";

function type(keys: KeypadKey[], start = ""): string {
  return keys.reduce(pressKey, start);
}

describe("pressKey", () => {
  it("arma montos con decimales", () => {
    expect(type(["1", "2", ".", "5", "0"])).toBe("12.50");
  });

  it("no deja más de 2 decimales", () => {
    expect(type(["3", ".", "9", "9", "9"])).toBe("3.99");
    expect(type(["3", ".", "9", "00"])).toBe("3.90");
  });

  it("el punto sin dígitos empieza en 0. y no se repite", () => {
    expect(type([".", ".", "5"])).toBe("0.5");
  });

  it("no acepta ceros a la izquierda", () => {
    expect(type(["0", "0", "7"])).toBe("7");
    expect(type(["00"])).toBe("0");
  });

  it("limita los enteros a 7 dígitos", () => {
    expect(type(["9", "9", "9", "9", "9", "9", "9", "9"])).toBe("9999999");
  });

  it("borrar y limpiar", () => {
    expect(pressKey("12.5", "back")).toBe("12.");
    expect(pressKey("12.5", "clear")).toBe("");
  });
});

describe("conversiones", () => {
  it("keypadToNumber", () => {
    expect(keypadToNumber("")).toBe(0);
    expect(keypadToNumber("0.")).toBe(0);
    expect(keypadToNumber("12.5")).toBe(12.5);
  });

  it("numberToKeypad", () => {
    expect(numberToKeypad(2.5)).toBe("2.5");
    expect(numberToKeypad(0)).toBe("");
    expect(numberToKeypad(undefined)).toBe("");
  });

  it("keyFromKeyboard traduce teclas físicas", () => {
    expect(keyFromKeyboard("7")).toBe("7");
    expect(keyFromKeyboard(",")).toBe(".");
    expect(keyFromKeyboard("Backspace")).toBe("back");
    expect(keyFromKeyboard("a")).toBeNull();
  });
});

describe("formatKeypad", () => {
  it("muestra lo tecleado con miles y coma decimal", () => {
    expect(formatKeypad("")).toBe("$0");
    expect(formatKeypad("1234.5")).toBe("$1.234,5");
    expect(formatKeypad("0.")).toBe("$0,");
    expect(formatKeypad("20")).toBe("$20");
  });
});
