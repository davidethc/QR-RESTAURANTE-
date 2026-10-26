import { expect, test } from "@playwright/test";
import { credentialsFor, login, missingCredentialsReason } from "../support/qa";
import { createCounterOrder, openOrderDetail, payOpenChargeSheet } from "./helpers";

const NAME = "QA E2E";
const PHONE = "+593 99 123 4567";

test.describe.configure({ mode: "serial" });

test.describe("Counter orders (M18 P5-P7)", () => {
  test.skip(!credentialsFor("owner"), missingCredentialsReason("owner"));
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    await login(page, "owner");
  });

  test("P5: a dine-in order without table ('Para comer aquí') is created and charged", async ({ page }) => {
    await createCounterOrder(page, { kind: "Para comer aquí", name: NAME, charge: "now" });
    await payOpenChargeSheet(page);
  });

  test("P6: a takeaway order is created and charged", async ({ page }) => {
    await createCounterOrder(page, { kind: "Para llevar", name: NAME, charge: "now" });
    await payOpenChargeSheet(page);
  });

  test("P7 + case 21: a delivery order keeps its phone prefilled on edit and is charged", async ({ page }) => {
    await createCounterOrder(page, {
      kind: "Domicilio",
      name: NAME,
      phone: PHONE,
      street: "Calle QA E2E",
      number: "1",
      neighborhood: "Sector QA",
      charge: "later",
    });

    const detail = await openOrderDetail(page, NAME);
    await detail.getByRole("button", { name: "Más acciones" }).click();
    await page.getByRole("menuitem", { name: "Editar pedido" }).click();

    const editor = page.getByRole("dialog", { name: /^Editar pedido #/ });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel(/^Teléfono/)).toHaveValue(PHONE);
    await page.keyboard.press("Escape");

    const again = await openOrderDetail(page, NAME);
    await again.getByRole("button", { name: /^Cobrar/ }).click();
    await payOpenChargeSheet(page);
  });

  test("case 12 (counter side): cancelling an order asks for a reason", async ({ page }) => {
    await createCounterOrder(page, { kind: "Para llevar", name: NAME, charge: "later" });

    const detail = await openOrderDetail(page, NAME);
    await detail.getByRole("button", { name: /^Cobrar/ }).click();
    const sheet = page.getByRole("dialog", { name: /^Cobrar/ });
    await sheet.getByRole("button", { name: "Cancelar venta" }).click();

    const confirm = page.getByRole("dialog", { name: /^¿Cancelar / });
    await confirm.getByRole("button", { name: "Cancelar venta" }).click();
    // Without a reason the form must not cancel the order and must show an error.
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("alert").first()).toBeVisible();

    await confirm.getByLabel("Motivo").fill("QA E2E");
    await confirm.getByRole("button", { name: "Cancelar venta" }).click();
    await expect(confirm).toBeHidden();
  });
});
