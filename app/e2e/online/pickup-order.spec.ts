import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { credentialsFor, missingCredentialsReason, newSession, QA_SLUG } from "../support/qa";

const CUSTOMER_NAME = "QA E2E";
const CUSTOMER_PHONE = "0999999999";
const REASON = "QA E2E";

async function addFirstDishToCart(page: Page) {
  await page.getByRole("button", { name: /^Agregar combo|platos · desde/ }).first().click();
  await page.getByRole("button", { name: /agregar/i }).first().click();
  await expect(page.getByRole("button", { name: /Ver pedido con \d+ producto/ })).toBeVisible();
}

test.describe("Menú digital: modo de servicio", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("customer can switch between delivery and pickup on mobile", async ({ page }) => {
    await page.goto(`/pedir/${QA_SLUG}`);
    await expect(page.getByRole("navigation", { name: "Categorías" })).toBeVisible();
    await page.getByRole("radio", { name: /Para recoger/ }).click();
    await expect(page.getByRole("radio", { name: /Para recoger/ })).toBeChecked();
    await page.getByRole("radio", { name: /A domicilio/ }).click();
    await expect(page.getByRole("radio", { name: /A domicilio/ })).toBeChecked();
  });
});

test.describe("Pedido en línea para recoger (/pedir)", () => {
  test.skip(!credentialsFor("owner"), missingCredentialsReason("owner"));

  test("customer places a pickup order, staff sees it and closes it with a reason", async ({ browser }) => {
    test.setTimeout(180_000);

    // Customer: mobile context, no session.
    const customerCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const customer = await customerCtx.newPage();
    let staffCtx: BrowserContext | undefined;

    try {
      await customer.goto(`/pedir/${QA_SLUG}`);
      await expect(customer.getByRole("navigation", { name: "Categorías" })).toBeVisible();

      if (await customer.getByText("Puedes ver el menú; los pedidos están cerrados").isVisible()) {
        test.info().annotations.push({
          type: "skipped",
          description: "monky-qa has online orders paused; not reactivated on purpose",
        });
        test.skip(true, "Online orders are paused for monky-qa");
      }

      // Staff: separate desktop context logged in as owner (only needed when orders are open).
      const staff = await newSession(browser, "owner");
      staffCtx = staff.context;

      // Baseline of the staff panel (delta assertions only).
      await staff.page.goto("/orders");
      const panel = staff.page.getByRole("region", { name: /En línea/ });
      await expect(panel).toBeVisible();
      const cardsBefore = await panel.locator("li", { hasText: CUSTOMER_NAME }).count();

      // Choose pickup, add a dish and review the cart.
      await customer.getByRole("radio", { name: /Para recoger/ }).click();
      await expect(customer.getByRole("radio", { name: /Para recoger/ })).toBeChecked();
      await addFirstDishToCart(customer);
      await customer.getByRole("button", { name: /Ver pedido con \d+ producto/ }).click();
      const sheet = customer.getByRole("dialog");
      await expect(sheet.getByText("Para recoger").first()).toBeVisible();
      await sheet.getByRole("button", { name: "Continuar" }).click();

      // Contact details.
      await expect(sheet.getByText("Tus datos", { exact: true }).first()).toBeVisible();
      await sheet.getByLabel("Nombre").fill(CUSTOMER_NAME);
      await sheet.getByLabel("Teléfono").fill(CUSTOMER_PHONE);
      await expect(sheet.getByText("Dirección de entrega")).toHaveCount(0);

      // Pick the first available payment method.
      await sheet.getByRole("radiogroup", { name: "Método de pago" }).getByRole("radio").first().click();
      // The form also has a hidden submit button named "Enviar pedido"; click the visible one with the total.
      await sheet.getByRole("button", { name: /^Enviar pedido \$/ }).click();

      // Confirmation inside the system (tracking page), not WhatsApp.
      await expect(customer).toHaveURL(new RegExp(`/pedir/${QA_SLUG}/pedido/[^/]+`));
      await expect(customer).not.toHaveURL(/wa\.me|whatsapp/);

      // Staff sees the new order in /orders.
      await staff.page.goto("/orders");
      const cards = staff.page.getByRole("region", { name: /En línea/ }).locator("li", { hasText: CUSTOMER_NAME });
      await expect.poll(async () => cards.count(), { timeout: 30_000 }).toBeGreaterThan(cardsBefore);
      const card = cards.first();
      await expect(card.getByText("Para recoger")).toBeVisible();
      await card.getByRole("button", { name: "Ver datos de contacto" }).click();
      await expect(card.getByText(CUSTOMER_PHONE)).toBeVisible();

      // Clean finish: reject with reason so nothing is left open.
      await card.getByRole("button", { name: "Rechazar" }).click();
      await card.getByLabel(/Motivo/).fill(REASON);
      await card.getByRole("button", { name: "Rechazar" }).click();
      await expect.poll(async () => cards.count(), { timeout: 30_000 }).toBe(cardsBefore);
    } finally {
      await customerCtx.close();
      await staffCtx?.close();
    }
  });
});
