import { expect, test } from "@playwright/test";
import { credentialsFor, login, missingCredentialsReason, type QaRole } from "./support/qa";

const landings: Array<{ role: QaRole; landing: RegExp }> = [
  { role: "owner", landing: /\/today/ },
  { role: "waiter", landing: /\/(tables|orders|today)/ },
  { role: "kitchen", landing: /\/kitchen/ },
];

test.describe("Login por rol y guardas de ruta (monky-qa)", () => {
  test("sin sesión, el panel redirige a /login", async ({ page }) => {
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  });

  for (const { role, landing } of landings) {
    test(`${role} inicia sesión y aterriza en su pantalla`, async ({ page }) => {
      test.skip(!credentialsFor(role), missingCredentialsReason(role));
      await login(page, role);
      await expect(page).toHaveURL(landing);
    });
  }

  test("el mesero no puede abrir /reports ni /cash", async ({ page }) => {
    test.skip(!credentialsFor("waiter"), missingCredentialsReason("waiter"));
    await login(page, "waiter");
    for (const path of ["/reports", "/cash"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(path));
    }
  });

  test("cocina no puede abrir /orders y vuelve a /kitchen", async ({ page }) => {
    test.skip(!credentialsFor("kitchen"), missingCredentialsReason("kitchen"));
    await login(page, "kitchen");
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/kitchen/);
  });
});
