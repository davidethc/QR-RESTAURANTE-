import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { credentialsFor, missingCredentialsReason, type QaRole } from "../support/qa";

/**
 * Same as support/qa `newSession` but tolerant of cold `next dev` compiles
 * (the landing page after login can take longer than the default 15 s).
 */
export async function sessionFor(browser: Browser, role: QaRole) {
  const creds = credentialsFor(role);
  if (!creds) throw new Error(missingCredentialsReason(role));
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Correo").fill(creds.email);
  await page.getByLabel("Contraseña").fill(creds.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 90_000 });
  return { context, page };
}

export const TABLE_LABEL = "Mesa 2";
export const QA_NOTE = "QA E2E";

/** Table 2 tile on the staff floor plan (its aria-label starts with the table name). */
export function tableTile(page: Page): Locator {
  return page.getByRole("button", { name: /^Mesa 2(,|$)/ });
}

/** Right-hand detail panel (desktop viewport). */
export function tablePanel(page: Page): Locator {
  return page.getByRole("complementary", { name: "Detalle de la mesa" });
}

export async function openFloor(page: Page): Promise<void> {
  await page.goto("/tables");
  await expect(tableTile(page)).toBeVisible();
}

export async function selectTable(page: Page): Promise<void> {
  await tableTile(page).click();
  await expect(tablePanel(page).getByRole("heading", { name: TABLE_LABEL, level: 2 })).toBeVisible();
}

/**
 * Mark every kitchen order of table 2 as delivered from the orders board.
 * A paid bill only closes by itself once nothing is left in the kitchen.
 */
export async function deliverAllTable2Orders(page: Page): Promise<void> {
  await page.goto("/orders?table=2");
  await expect(page.getByRole("heading", { name: "Pedidos" })).toBeAttached();
  const deliver = page.getByRole("article").filter({ hasText: /Mesa 2/ }).getByRole("button", { name: "Entregado", exact: true });
  while ((await deliver.count()) > 0) {
    const before = await deliver.count();
    await deliver.first().click();
    // Kitchen has not marked it ready: the board asks for confirmation first.
    const confirm = page.getByRole("button", { name: "Sí, ya lo entregué" });
    await confirm.or(page.getByRole("button", { name: "Deshacer" })).first().waitFor();
    if (await confirm.isVisible()) await confirm.click();
    await expect.poll(() => deliver.count()).toBeLessThan(before);
    // The board defers the delivery a few seconds ("Deshacer"); leaving earlier cancels it.
    await expect(page.getByRole("button", { name: "Deshacer" })).toHaveCount(0, { timeout: 30_000 });
  }
}

/** Free table 2 if an old session blocks it. Returns true when a stale session was closed. */
export async function ensureTableFree(page: Page): Promise<boolean> {
  await openFloor(page);
  if (/Libre/.test((await tableTile(page).getAttribute("aria-label")) ?? "")) return false;
  await selectTable(page);
  const panel = tablePanel(page);
  const charge = panel.getByRole("button", { name: /Cobrar y liberar/ }).first();
  if (await charge.isVisible()) {
    // Active orders block a forced close: settle the old bill instead.
    const approve = panel.getByRole("button", { name: "Aprobar" });
    while (await approve.first().isVisible()) await approve.first().click();
    await charge.click();
    await chargeAndRelease(page);
  } else {
    await panel.getByRole("button", { name: /Forzar cierre/ }).click();
    await panel.getByLabel("Motivo").fill(QA_NOTE);
    await panel.getByRole("button", { name: "Forzar cierre" }).last().click();
  }
  await openFloor(page);
  if (!/Libre/.test((await tableTile(page).getAttribute("aria-label")) ?? "")) {
    await deliverAllTable2Orders(page);
    await openFloor(page);
  }
  await expect(tableTile(page)).toHaveAttribute("aria-label", /Libre/);
  return true;
}

/** Add the first product that needs no choices to the staff cart; returns its name. */
export async function addSimpleProductStaff(page: Page): Promise<string> {
  const tile = page
    .getByRole("region", { name: "Productos" })
    .getByRole("button", { name: /^(?!.*desde)/ })
    .filter({ hasNotText: "Elegir" })
    .first();
  await expect(tile).toBeVisible();
  const label = (await tile.getAttribute("aria-label")) ?? "";
  await tile.click();
  return label.split(",")[0];
}

/** Total units shown in the "Nueva comanda" header of the staff builder (0 when empty). */
export async function cartUnits(page: Page): Promise<number> {
  const header = page.getByRole("complementary", { name: "Comanda" }).getByRole("heading", { name: /Nueva comanda/ });
  const text = await header.innerText();
  const m = text.match(/(\d+)\s+producto/);
  return m ? Number(m[1]) : 0;
}

/** Walk the charge sheet (account, how, method, done) paying cash until it shows the final step. */
export async function chargeAndRelease(page: Page): Promise<void> {
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const done = sheet.getByRole("button", { name: /^(Listo|Cerrar cuenta y liberar)$/ });
  const next = sheet.getByRole("button", { name: /^(Cobrar|Continuar)\s*[·$]/ });
  const cash = sheet.getByText("Efectivo", { exact: true }).first();
  const paid = sheet.getByRole("link", { name: /Imprimir ticket/ });
  // isEnabled() waits for the element, so guard with count() to keep polling instant.
  const canNext = async () => (await next.count()) > 0 && (await next.first().isEnabled());
  for (let i = 0; i < 8; i++) {
    await expect
      .poll(async () => (await done.isVisible()) || (await paid.isVisible()) || (await canNext()), { timeout: 60_000 })
      .toBe(true);
    if (!(await done.isVisible()) && (await paid.isVisible()) && !(await canNext())) {
      // Already paid (the kitchen still holds orders): nothing left to charge.
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      return;
    }
    if (await done.isVisible()) {
      // "Listo" leaves the sheet on the paid summary; the next pass closes it.
      await done.click();
      continue;
    }
    if (await cash.isVisible()) await cash.click();
    await next.click();
  }
  throw new Error("Charge sheet did not reach the final step");
}
