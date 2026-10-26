import { expect, type Locator, type Page } from "@playwright/test";

export type CounterKind = "Para comer aquí" | "Para llevar" | "Domicilio";

export interface NewOrderData {
  kind: CounterKind;
  /** Customer name typed into the form. */
  name: string;
  /** Only used for delivery. */
  phone?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  /** "now" charges right away, "later" sends to the kitchen and leaves it unpaid. */
  charge: "now" | "later";
}

/** Opens the "Nuevo pedido" flow on /orders, builds one order and submits it. */
export async function createCounterOrder(page: Page, data: NewOrderData): Promise<void> {
  await page.goto("/orders");
  await page.getByRole("button", { name: "Nuevo pedido" }).first().click();
  await page.getByText(data.kind, { exact: true }).first().click();

  const builder = page.getByRole("dialog", { name: /Nuevo pedido/ });
  const products = builder.getByRole("region", { name: "Productos" }).getByRole("button");
  await expect(products.first()).toBeVisible();

  if (data.kind === "Domicilio") {
    await builder.getByRole("radio", { name: "Domicilio propio" }).click();
    await builder.getByLabel("Nombre", { exact: true }).fill(data.name);
    await builder.getByLabel(/^Teléfono/).fill(data.phone ?? "");
    await builder.getByLabel("Calle").fill(data.street ?? "");
    await builder.getByLabel("Número").fill(data.number ?? "");
    await builder.getByLabel("Barrio / sector").fill(data.neighborhood ?? "");
    await builder.getByLabel(/^Costo de envío/).fill("1");
  } else {
    await builder.getByLabel("Nombre del cliente (opcional)").fill(data.name);
  }

  // A simple product (no variants/extras) is added with a single tap.
  await products.filter({ hasNotText: "Elegir" }).first().click();
  await expect(builder.getByRole("button", { name: /^Quitar / }).first()).toBeVisible();

  if (data.charge === "now") {
    await builder.getByRole("button", { name: /Cobrar ahora/ }).click();
  } else {
    await builder.getByRole("button", { name: /cobrar después/ }).click();
    await expect(builder).toBeHidden();
  }
}

/** Walks the charge sheet (already open) through to "Listo" paying the full balance. */
export async function payOpenChargeSheet(page: Page): Promise<void> {
  const sheet = page.getByRole("dialog", { name: /^Cobrar/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /^Cobrar/ }).click();
  await sheet.getByRole("button", { name: /^Continuar/ }).click();
  await sheet.getByRole("button", { name: /^Cobrar/ }).click();
  const done = sheet.getByRole("button", { name: "Listo" });
  await expect(done).toBeVisible();
  await done.click();
  // The sheet stays open on the paid account: nothing is left to collect.
  await expect(sheet.getByText("Saldo pendiente")).toBeVisible();
  await expect(sheet.getByText("$0,00").first()).toBeVisible();
  await expect(sheet.getByText("Pagos realizados")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
}

/** Opens the detail dialog of a counter order from the "Para llevar y domicilio" panel. */
export async function openOrderDetail(page: Page, customerName: string): Promise<Locator> {
  await page.goto("/orders");
  await page.getByRole("button", { name: new RegExp(`^#\\d+ · ${customerName}`) }).first().click();
  const detail = page.getByRole("dialog", { name: /^Pedido #/ });
  await expect(detail).toBeVisible();
  return detail;
}
