import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { credentialsFor, missingCredentialsReason, QA_SLUG, tableToken } from "../support/qa";
import {
  addSimpleProductStaff,
  cartUnits,
  deliverAllTable2Orders,
  chargeAndRelease,
  ensureTableFree,
  openFloor,
  QA_NOTE,
  sessionFor,
  selectTable,
  tablePanel,
  tableTile,
} from "./helpers";

// M18 P3 + P4 on table 2 of monky-qa. Serial: each step builds on the table state of the previous one.
test.describe.serial("Table 2: waiter service and QR client (M18 P3, P4)", () => {
  test.skip(
    !credentialsFor("owner") || !credentialsFor("waiter") || !tableToken(2),
    `${missingCredentialsReason("owner")} / ${missingCredentialsReason("waiter")} / QA_MONKY_TABLE_2_TOKEN`
  );
  test.setTimeout(180_000);
  // The QR token is a secret-like value: only ever used inside this variable, never logged.
  const token = tableToken(2)!;

  let owner: { context: BrowserContext; page: Page };
  let waiter: { context: BrowserContext; page: Page };
  let qr: { context: BrowserContext; page: Page };

  test.beforeAll(async ({ browser }) => {
    owner = await sessionFor(browser, "owner");
    waiter = await sessionFor(browser, "waiter");
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    // The Next dev indicator overlaps the bottom action bar on a phone viewport.
    await context.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal{display:none!important}";
        document.head.appendChild(style);
      });
    });
    qr = { context, page: await context.newPage() };
  });

  test.afterAll(async () => {
    await Promise.all([owner?.context.close(), waiter?.context.close(), qr?.context.close()]);
  });

  test("prep: table 2 starts free (closes an old session if present)", async ({}, testInfo) => {
    const closed = await ensureTableFree(owner.page);
    testInfo.annotations.push({ type: "stale-session", description: closed ? "closed with Forzar cierre" : "none" });
    await openFloor(owner.page);
    await selectTable(owner.page);
    await expect(tablePanel(owner.page).getByRole("button", { name: "Abrir mesa" })).toBeVisible();
  });

  test("case 12 + 13: cancelling an order asks for a reason and hides Cobrar", async () => {
    const { page: wp } = waiter;
    await openFloor(wp);
    await selectTable(wp);
    await tablePanel(wp).getByRole("button", { name: "Abrir mesa" }).click();
    await tablePanel(wp).getByRole("link", { name: "Tomar pedido" }).click();
    await expect(wp.getByRole("heading", { name: "Mesa 2", level: 1 })).toBeVisible();
    await addSimpleProductStaff(wp);
    await wp.getByRole("complementary", { name: "Comanda" }).getByRole("button", { name: "Enviar a cocina" }).click();
    await expect(wp.getByText(/Comanda #\d+ enviada a cocina/)).toBeVisible();

    const op = owner.page;
    await openFloor(op);
    await selectTable(op);
    const panel = tablePanel(op);
    await expect(panel.getByText(/Pedido #\d+/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /Cobrar y liberar/ })).toBeVisible();

    // Empty reason is rejected and the order stays.
    await panel.getByRole("button", { name: "Cancelar pedido" }).click();
    await panel.getByRole("button", { name: "Cancelar pedido" }).last().click();
    await expect(panel.getByRole("alert")).toContainText(/motivo/i);
    await expect(panel.getByRole("heading", { name: "Cancelar pedido" })).toBeVisible();

    // With a reason it is cancelled and the charge action disappears.
    await panel.getByLabel("Motivo").fill(QA_NOTE);
    await panel.getByRole("button", { name: "Cancelar pedido" }).last().click();
    await expect(op.getByText("Pedido cancelado")).toBeVisible();
    await selectTable(op);
    await expect(panel.getByRole("button", { name: /Cobrar y liberar/ })).toHaveCount(0);
  });

  test("P3 + case 24: waiter sends a ticket with a note; Separar uno keeps the total quantity", async () => {
    const wp = waiter.page;
    await openFloor(wp);
    await selectTable(wp);
    const panel = tablePanel(wp);
    if (await panel.getByRole("button", { name: "Abrir mesa" }).isVisible()) {
      await panel.getByRole("button", { name: "Abrir mesa" }).click();
    }
    await panel.getByRole("link", { name: /Tomar pedido|Agregar productos/ }).click();
    await expect(wp.getByRole("heading", { name: "Mesa 2", level: 1 })).toBeVisible();

    const name = await addSimpleProductStaff(wp);
    await addSimpleProductStaff(wp);
    const cart = wp.getByRole("complementary", { name: "Comanda" });
    await expect.poll(() => cartUnits(wp)).toBe(2);

    // Case 24: splitting one unit off a line must not change the total units.
    await cart.getByRole("button", { name: `Separar uno de ${name}` }).click();
    await expect.poll(() => cartUnits(wp)).toBe(2);
    await expect(cart.getByRole("button", { name: `Quitar ${name}` })).toHaveCount(2);

    // Note "QA E2E" on one line.
    await cart.getByRole("button", { name: new RegExp(`^Editar ${name}`) }).first().click();
    await wp.getByRole("dialog").getByRole("textbox").fill(QA_NOTE);
    await wp.getByRole("dialog").getByRole("button", { name: /Guardar cambios/ }).click();
    await expect(cart.getByText(`“${QA_NOTE}”`)).toBeVisible();

    await cart.getByRole("button", { name: "Enviar a cocina" }).click();
    await expect(wp.getByText(/Comanda #\d+ enviada a cocina/)).toBeVisible();
    await expect(cart.getByText(/Ya enviado · 1 comanda/)).toBeVisible();
  });

  test("case 17: the QR token is random, not a guessable number", async ({ browser }) => {
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(token).not.toMatch(/^\d{1,6}$/);
    const probe = await browser.newContext();
    const page = await probe.newPage();
    // A guessable number is rejected and never opens a table.
    await page.goto("/scan/2");
    await expect(page).toHaveURL(/qr-invalido/);
    // The plain table URL without the scan cookie does not become a table session.
    await page.goto(`/r/${QA_SLUG}/2`);
    await expect(page.getByRole("button", { name: "Llamar mesero" })).toHaveCount(0);
    await probe.close();
  });

  test("P4 + case 16: QR client orders, calls the waiter and asks for the bill; both staff contexts see it live", async () => {
    const { page: op } = owner;
    const wp = waiter.page;
    await openFloor(op);
    await selectTable(op);
    await openFloor(wp);
    await selectTable(wp);
    const orderRows = (p: Page) => tablePanel(p).getByRole("listitem").filter({ hasText: /Pedido #\d+/ });
    const before = await orderRows(op).count();

    // QR client scans and names the table.
    const q = qr.page;
    await q.goto(`/scan/${token}`);
    await expect(q).toHaveURL(new RegExp(`/r/${QA_SLUG}/2`));
    const nameBox = q.getByLabel("Tu nombre");
    await nameBox.or(q.getByRole("button", { name: "Llamar mesero" })).waitFor({ timeout: 60_000 });
    if (await nameBox.isVisible()) {
      await nameBox.fill(QA_NOTE);
      await q.getByRole("button", { name: "Ver la carta" }).click();
    }
    await expect(q.getByRole("button", { name: "Llamar mesero" })).toBeVisible({ timeout: 60_000 });

    // Add the first dish (picking the first variant when one is required).
    await q.getByRole("button", { name: /^Bebidas.*platos/, expanded: false }).click();
    // "Agua QA" is also inside the combo card, so skip that one.
    await q.getByRole("button", { name: /Agua QA.*\$1,25/ }).filter({ hasNotText: "Los dos" }).first().click();
    const sheet = q.getByRole("dialog");
    const variants = sheet.getByRole("radiogroup", { name: "Variante" }).getByRole("radio");
    await expect(sheet.getByRole("button", { name: /^Agregar \d+ .* al pedido/ })).toBeVisible();
    if ((await variants.count()) > 0) await variants.first().click();
    await sheet.getByRole("button", { name: "Agregar indicaciones especiales para la cocina" }).click();
    await sheet.getByLabel("Indicaciones para la cocina").fill(QA_NOTE);
    await sheet.getByRole("button", { name: /^Agregar \d+ .* al pedido/ }).click();
    await q.getByRole("button", { name: /^Ver pedido con/ }).click();
    await q.getByRole("button", { name: "Enviar pedido" }).click();
    await q.getByRole("button", { name: "Sí, enviar" }).click();

    // Case 16: both staff contexts get the new order within 5 s with no reload.
    await expect(orderRows(op)).toHaveCount(before + 1, { timeout: 5000 });
    await expect(orderRows(wp)).toHaveCount(before + 1, { timeout: 5000 });

    // If QR orders need approval, approve from staff (setting is never changed).
    const approve = tablePanel(op).getByRole("button", { name: "Aprobar" });
    if (await approve.isVisible()) await approve.click();

    // Call the waiter.
    // Sending lands on the order tracker; go back to the table menu.
    await expect(q).toHaveURL(/\/order\//);
    await q.goto(`/r/${QA_SLUG}/2`);
    await q.getByRole("button", { name: "Llamar mesero" }).click();
    await q.getByRole("button", { name: "Llamar", exact: true }).click();
    await expect(tableTile(op)).toHaveAttribute("aria-label", /Llamando al mesero/, { timeout: 5000 });
    await expect(tableTile(wp)).toHaveAttribute("aria-label", /Llamando al mesero/, { timeout: 5000 });

    // Ask for the bill.
    await q.getByRole("button", { name: "Pedir cuenta" }).click();
    await q.getByRole("button", { name: "Solicitar", exact: true }).click();
    await expect(tableTile(op)).toHaveAttribute("aria-label", /Pide cuenta/, { timeout: 5000 });
    await expect(tableTile(wp)).toHaveAttribute("aria-label", /Pide cuenta/, { timeout: 5000 });
  });

  test("owner charges and closes the bill so table 2 is left free", async () => {
    const op = owner.page;
    await openFloor(op);
    await selectTable(op);
    const panel = tablePanel(op);
    const approve = panel.getByRole("button", { name: "Aprobar" });
    while (await approve.first().isVisible()) await approve.first().click();
    await panel.getByRole("button", { name: /Cobrar y liberar/ }).first().click();
    await chargeAndRelease(op);
    // A paid bill closes itself once the kitchen has nothing left: deliver what is pending.
    await deliverAllTable2Orders(op);
    await openFloor(op);
    await expect(tableTile(op)).toHaveAttribute("aria-label", /Libre/);
  });
});
