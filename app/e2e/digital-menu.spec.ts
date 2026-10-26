import { expect, test } from "@playwright/test";
import { QA_SLUG } from "./support/qa";

test.describe("Menú digital público", () => {
  test(`/pedir/${QA_SLUG} muestra el menú y las categorías`, async ({ page }) => {
    await page.goto(`/pedir/${QA_SLUG}`);
    await expect(page.getByRole("radiogroup", { name: "Tipo de pedido" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Categorías" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "El menú" })).toBeVisible();
  });

  test("agregar un plato al carrito (si el negocio recibe pedidos en línea)", async ({ page }) => {
    await page.goto(`/pedir/${QA_SLUG}`);
    await expect(page.getByRole("navigation", { name: "Categorías" })).toBeVisible();

    const paused = page.getByText("Puedes ver el menú; los pedidos están cerrados");
    if (await paused.isVisible()) {
      // monky-qa tiene los pedidos en línea en pausa: el estado correcto es solo lectura.
      test.info().annotations.push({
        type: "skipped-part",
        description: "monky-qa tiene los pedidos en línea en pausa; no se reabre para no alterar su configuración",
      });
      await expect(page.getByText("Pedidos en línea en pausa", { exact: false })).toBeVisible();
      return;
    }

    await page.getByRole("button", { name: /^Agregar combo|platos · desde/ }).first().click();
    await page.getByRole("button", { name: /agregar/i }).first().click();
    await expect(page.getByRole("button", { name: /Ver pedido con \d+ producto/ })).toBeVisible();
  });
});
