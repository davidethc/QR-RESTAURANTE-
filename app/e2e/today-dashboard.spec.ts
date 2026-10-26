import { expect, test } from "@playwright/test";
import { credentialsFor, login, missingCredentialsReason } from "./support/qa";

test.describe('Hoy: "Ventas del periodo" (M14)', () => {
  test("el dueño ve el panel y el filtro de fechas cambia la URL", async ({ page }) => {
    test.skip(!credentialsFor("owner"), missingCredentialsReason("owner"));
    await login(page, "owner");
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Ventas del periodo" })).toBeVisible();

    const range = page.getByRole("radiogroup", { name: "Rango de fechas" }).or(page.getByRole("group", { name: "Rango de fechas" }));
    await expect(range).toBeVisible();
    await range.getByText("7 días", { exact: true }).click();
    await expect(page).toHaveURL(/preset=last7/);
    await expect(page.getByRole("heading", { name: "Ventas del periodo" })).toBeVisible();
  });

  test("el mesero no ve el panel de ventas", async ({ page }) => {
    test.skip(!credentialsFor("waiter"), missingCredentialsReason("waiter"));
    await login(page, "waiter");
    await page.goto("/today");
    // /today puede redirigir al mesero a su pantalla; en ningún caso aparece el panel.
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "Ventas del periodo" })).toHaveCount(0);
  });
});
