import { expect, test, type Page } from "@playwright/test";
import { credentialsFor, missingCredentialsReason, QA_SLUG } from "../support/qa";
import { addDays, cashIsClosed, openRegisterFromGate, ownerSession, QA_NOTE, typeOnKeypad } from "./helpers";

// Not serial on purpose: one real app bug must not skip the remaining cases (workers=1 keeps file order).
test.skip(!credentialsFor("owner"), missingCredentialsReason("owner"));

let page: Page;
let closeContext: () => Promise<void>;

/** Original values, recorded before anything is changed. */
const original: { qrApproval?: boolean; menuPaused?: boolean; registerOpen?: boolean } = {};

const PROMO_NAME = "QA E2E promo";

async function readQrApproval(p: Page): Promise<boolean> {
  await p.goto("/settings");
  const approve = p.getByRole("radio", { name: /El mesero aprueba/ });
  await expect(approve).toBeVisible({ timeout: 60_000 });
  return (await approve.getAttribute("aria-checked")) === "true";
}

async function setQrApproval(p: Page, approval: boolean) {
  await p.goto("/settings");
  const target = p.getByRole("radio", { name: approval ? /El mesero aprueba/ : /Directo a cocina/ });
  await expect(target).toBeVisible({ timeout: 60_000 });
  if ((await target.getAttribute("aria-checked")) !== "true") await target.click();
  await expect(target).toHaveAttribute("aria-checked", "true");
}

async function menuIsPaused(p: Page): Promise<boolean> {
  await p.goto("/settings/menu-digital");
  const resume = p.getByRole("button", { name: "Reactivar ahora" });
  const pauseGroup = p.getByRole("group", { name: "Pausar por" });
  await expect(resume.or(pauseGroup)).toBeVisible({ timeout: 60_000 });
  return resume.isVisible();
}

async function resumeMenu(p: Page) {
  if (await menuIsPaused(p)) {
    await p.getByRole("button", { name: "Reactivar ahora" }).click();
    await expect(p.getByRole("group", { name: "Pausar por" })).toBeVisible();
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const s = await ownerSession(browser);
  page = s.page;
  closeContext = () => s.context.close();
  original.qrApproval = await readQrApproval(page);
  original.menuPaused = await menuIsPaused(page);
  original.registerOpen = !(await cashIsClosed(page));
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  try {
    if (original.qrApproval !== undefined) await setQrApproval(page, original.qrApproval);
  } catch {
    /* best effort */
  }
  try {
    // Deliberate: the menu is left ACTIVE so online/pickup-order.spec.ts can run.
    await resumeMenu(page);
  } catch {
    /* best effort */
  }
  try {
    if (await cashIsClosed(page)) await openRegisterFromGate(page);
  } catch {
    /* best effort */
  }
  await closeContext?.();
});

test("P10: cash in and cash out movements with note QA E2E", async () => {
  test.setTimeout(180_000);
  if (await cashIsClosed(page)) await openRegisterFromGate(page);

  await page.getByRole("button", { name: /^Meter/ }).click();
  let dialog = page.getByRole("dialog", { name: /Meter dinero a la caja/ });
  await dialog.getByRole("radio", { name: /Refuerzo de fondo/ }).click();
  await dialog.getByLabel(/^Nota/).fill(QA_NOTE);
  await typeOnKeypad(dialog, "5");
  await dialog.getByRole("button", { name: /^Meter / }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Sacar/ }).click();
  dialog = page.getByRole("dialog", { name: /Sacar dinero de la caja/ });
  await dialog.getByRole("radio", { name: /Retiro/ }).click();
  await dialog.getByLabel(/^Nota/).fill(QA_NOTE);
  await typeOnKeypad(dialog, "5");
  await dialog.getByRole("button", { name: /^Sacar / }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/cash/movimientos");
  await expect(page.getByText(QA_NOTE).first()).toBeVisible({ timeout: 30_000 });
});

test("P11 + case 10: blind cash cut, then reopen the register", async () => {
  test.setTimeout(300_000);
  await cashIsClosed(page);

  // Charge leftover QA orders that would block the cut.
  const queue = page.getByRole("region", { name: "Estado de la caja" });
  await expect(queue).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.goto("/cash");
    await expect(queue).toBeVisible({ timeout: 60_000 });
    const owedTab = page.getByRole("tab", { name: /Por cobrar/ });
    if (await owedTab.isVisible()) await owedTab.click();
    const bills = page.getByRole("tabpanel").getByRole("button", { name: /Por cobrar/ });
    if ((await bills.count()) === 0) break;
    await bills.first().click();
    const panel = page.getByRole("region", { name: "Cobro" });
    for (let step = 0; step < 6; step++) {
      const done = panel.getByRole("button", { name: "Listo" });
      await expect(done.or(panel.locator("button:not([disabled])", { hasText: /^(Cobrar|Continuar)/ }).first())).toBeVisible();
      if (await done.isVisible()) {
        await done.click();
        break;
      }
      await panel.locator("button:not([disabled])", { hasText: /^(Cobrar|Continuar)/ }).first().click();
      await page.waitForTimeout(500);
    }
  }

  await page.goto("/cash");
  await page.getByRole("button", { name: /^Corte/ }).click();
  const wizard = page.getByRole("dialog", { name: /Corte/ });
  await expect(wizard).toBeVisible();
  // Blind: expected amount is never shown while declaring.
  await expect(wizard.getByText(/esperado/i)).toHaveCount(0);
  await expect(wizard.getByText(/a ciegas/i)).toBeVisible();

  // Denomination calculator.
  const plusButtons = wizard.getByRole("button", { name: /^Uno más de/ });
  await plusButtons.first().click();
  await plusButtons.first().click();
  await plusButtons.nth(2).click();
  await expect(wizard.getByText("Total en efectivo")).toBeVisible();
  await expect(wizard.getByRole("button", { name: /^Contado: / })).toBeEnabled();
  await wizard.getByRole("button", { name: /^Contado: / }).click();
  await wizard.getByRole("button", { name: "Continuar" }).click(); // card & other
  await expect(wizard.getByRole("button", { name: /Omitir y continuar|Marca la opción/ })).toHaveCount(0);
  await expect(wizard.getByText("Todo está cobrado. Puedes seguir.")).toBeVisible();
  await wizard.getByRole("button", { name: "Continuar" }).click();
  await wizard.getByRole("button", { name: "Guardar corte y cerrar caja" }).click();

  await expect(page).toHaveURL(/\/cash\/cortes\//, { timeout: 60_000 });
  await expect(page.getByText(/^(Exacto|Faltante|Sobrante)$/).first()).toBeVisible();

  // Leave the restaurant with an open register, as before.
  await page.goto("/cash");
  await expect(page.getByRole("heading", { name: "La caja está cerrada" })).toBeVisible({ timeout: 60_000 });
  await openRegisterFromGate(page);
});

test("Case 18: QR orders direct or with approval, then restore", async () => {
  test.setTimeout(180_000);
  const start = await readQrApproval(page);
  await setQrApproval(page, !start);
  await page.reload();
  await expect(page.getByRole("radio", { name: start ? /Directo a cocina/ : /El mesero aprueba/ })).toHaveAttribute("aria-checked", "true");
  await setQrApproval(page, start);
  await page.reload();
  await expect(page.getByRole("radio", { name: start ? /El mesero aprueba/ : /Directo a cocina/ })).toHaveAttribute("aria-checked", "true");
});

test("P12: pause and resume the digital menu", async () => {
  test.setTimeout(180_000);
  await resumeMenu(page);

  await page.getByRole("group", { name: "Pausar por" }).getByRole("button", { name: "Hasta reactivar" }).click();
  await expect(page.getByRole("button", { name: "Reactivar ahora" })).toBeVisible();
  await page.goto(`/pedir/${QA_SLUG}`);
  await expect(page.getByText("Pedidos en línea en pausa").first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/settings/menu-digital");
  await page.getByRole("button", { name: "Reactivar ahora" }).click();
  await expect(page.getByRole("group", { name: "Pausar por" })).toBeVisible();
  await page.goto(`/pedir/${QA_SLUG}`);
  await expect(page.getByRole("navigation", { name: "Categorías" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Pedidos en línea en pausa")).toHaveCount(0);
});

test("P2: sold-out product variant shows Agotado, then available again", async () => {
  test.setTimeout(180_000);
  await page.goto("/availability");
  const toggles = page.getByRole("switch", { name: /: Disponible$/ });
  await expect(toggles.first()).toBeVisible({ timeout: 60_000 });
  const label = (await toggles.first().getAttribute("aria-label")) ?? "";
  const title = label.replace(/: Disponible$/, "");
  const productName = title.split(" · ")[0];
  let soldOut = false;
  try {
    await toggles.first().click();
    soldOut = true;
    await expect(page.getByRole("switch", { name: `${title}: Agotado` })).toBeVisible();

    await page.goto("/today");
    const row = page.getByRole("listitem").filter({ hasText: productName }).filter({ hasText: "Agotado" });
    await expect(row.first()).toBeVisible({ timeout: 30_000 });

    // The public menu is cached; give the tag refresh a few reloads to land.
    await expect(async () => {
      await page.goto(`/pedir/${QA_SLUG}`);
      await expect(page.getByRole("navigation", { name: "Categorías" })).toBeVisible();
      // Sections are collapsed accordions: open every one so the product card renders.
      const collapsed = page.locator("main h2 button[aria-expanded='false']");
      while ((await collapsed.count()) > 0) await collapsed.first().click();
      await expect(page.getByText(/Agotado/i).first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000, intervals: [2_000, 5_000] });
  } finally {
    if (soldOut) {
      await page.goto("/availability");
      const back = page.getByRole("switch", { name: `${title}: Agotado` });
      await expect(back).toBeVisible({ timeout: 60_000 });
      await back.click();
      await expect(page.getByRole("switch", { name: `${title}: Disponible` })).toBeVisible();
    }
  }
});

test("Cases 1-2: promotion day selector starts empty; create, verify and delete a date-range promo", async () => {
  test.setTimeout(180_000);
  await page.goto("/menu");
  await page.getByRole("radio", { name: "Promociones" }).click();
  await page.getByRole("button", { name: "Nueva promoción" }).first().click();
  const sheet = page.getByRole("dialog");
  const steps = sheet.getByRole("navigation", { name: "Pasos de la promoción" });

  await sheet.getByRole("radio", { name: /Descuento en productos/ }).click();
  await sheet.getByLabel("Nombre de la promoción").fill(PROMO_NAME);
  await sheet.getByLabel(/^Porcentaje|^Monto por unidad/).fill("10");

  await steps.getByRole("button", { name: /Productos/ }).click();
  await sheet.getByLabel("Buscar producto").fill("QA");
  await sheet.getByRole("group", { name: "Platos" }).locator("button").first().click();
  await expect(sheet.getByRole("status").filter({ hasText: "1 elegido" })).toBeVisible();

  await steps.getByRole("button", { name: /Cuándo/ }).click();
  // Case 2: no weekday is selected initially.
  await expect(sheet.getByText("Todavía no elegiste ningún día")).toBeVisible();
  await sheet.getByRole("radio", { name: "Rango de fechas" }).click();
  const start = sheet.getByLabel("Desde");
  const today = (await start.getAttribute("min")) ?? "";
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await start.fill(today);
  await sheet.getByLabel("Hasta (incluido)").fill(addDays(today, 1)); // crosses local midnight

  await steps.getByRole("button", { name: /Canales/ }).click();
  let created = false;
  try {
    await sheet.getByRole("button", { name: "Crear promoción" }).click();
    created = true;
    await expect(sheet).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText(PROMO_NAME).first()).toBeVisible();
  } finally {
    if (created || (await page.getByText(PROMO_NAME).count()) > 0) {
      await page.goto("/menu");
      await page.getByRole("radio", { name: "Promociones" }).click();
      const del = page.getByRole("button", { name: `Borrar ${PROMO_NAME}` });
      while ((await del.count()) > 0) {
        await del.first().click();
        await page.getByRole("button", { name: "Borrar promoción" }).click();
        await expect(page.getByText("Promoción borrada").first()).toBeVisible();
        await page.reload();
        await page.getByRole("radio", { name: "Promociones" }).click();
      }
      await expect(page.getByText(PROMO_NAME)).toHaveCount(0);
    }
  }
});

test("Case 26: tips toggle", async () => {
  test.fixme(true, "The app has no restaurant-level tips on/off setting; tips are chosen per payment (Sin propina chip). See RESULTS.md.");
});
