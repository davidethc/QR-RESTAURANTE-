import { expect, test, type Locator, type Page } from "@playwright/test";
import { credentialsFor, missingCredentialsReason, newSession } from "../support/qa";

/**
 * M18 P9 · caso 14: cocina (KDS) sigue un pedido de mostrador "Para llevar"
 * creado por el dueño, en otro contexto de navegador.
 *
 * Corre contra el restaurante monky-qa (base de producción) junto a otras
 * unidades, así que el pedido se localiza por un nombre de cliente único y los
 * contadores se comparan contra lo que muestra la propia pantalla, nunca contra
 * valores absolutos.
 */

const ORDER_NOTE = "QA E2E kitchen";
/** Server actions are slow against the shared production DB (and cold in next dev). */
const SLOW = { timeout: 45_000 };
const PENDING_COUNT = /(\d+) comandas? por preparar/;

/** Comandas por preparar según el contador de la franja de estado (0 si "Todo al día"). */
async function pendingCounter(page: Page): Promise<number> {
  const strip = page.getByRole("region", { name: "Estado" });
  await expect(strip).toContainText(/comandas? por preparar|Todo al día/);
  const match = (await strip.innerText()).match(PENDING_COUNT);
  return match ? Number(match[1]) : 0;
}

function ticketCard(page: Page, customer: string): Locator {
  return page.getByRole("article").filter({ hasText: customer });
}

test.describe.serial("Cocina (KDS) de punta a punta", () => {
  test.skip(!credentialsFor("owner") || !credentialsFor("kitchen"), `${missingCredentialsReason("owner")} / ${missingCredentialsReason("kitchen")}`);

  test("pedido para llevar: aparece solo, lista, historial, devolver, lista de nuevo, entregar y cobrar", async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const customer = `QA KDS ${Date.now().toString(36)}`;
    const owner = await newSession(browser, "owner");
    const kitchen = await newSession(browser, "kitchen");
    const kPage = kitchen.page;
    const oPage = owner.page;

    try {
      // Cocina abre su pantalla ANTES de que exista el pedido.
      await kPage.goto("/kitchen");
      const baseline = await pendingCounter(kPage);
      expect(baseline).toBeGreaterThanOrEqual(0);

      // Dueño: pedido "Para llevar" con un plato QA y la nota.
      await oPage.goto("/orders");
      await oPage.getByRole("region", { name: "Estado de los pedidos" }).getByRole("button", { name: "Nuevo pedido" }).click();
      await oPage.getByRole("radio", { name: /Para llevar/ }).click();
      const builder = oPage.getByRole("dialog", { name: "Nuevo pedido · Para llevar" });
      await builder.getByRole("button", { name: /^Agua QA/ }).click();
      await builder.getByLabel("Nombre del cliente (opcional)").fill(customer);
      await builder.getByLabel("Comentario para cocina (opcional)").fill(ORDER_NOTE);
      await builder.getByRole("button", { name: /Enviar a cocina · cobrar después/ }).click();
      await expect(oPage.getByText(/en cocina, por cobrar/).first()).toBeVisible();
      await expect(builder).toBeHidden();

      // Cocina: la comanda llega sin recargar y es UNA comanda (caso 14).
      const pendingCard = ticketCard(kPage, customer);
      await expect(pendingCard).toHaveCount(1, { timeout: 45_000 });
      await expect(pendingCard).toContainText("Agua QA");
      await expect(pendingCard).toContainText("Comanda 1");
      await expect(pendingCard.getByRole("button", { name: "Comanda lista" })).toBeVisible();

      // Caso 14: el contador cuenta comandas (tarjetas), no pedidos.
      const cards = kPage.getByRole("list", { name: /Comandas por preparar/ }).getByRole("article");
      await expect.poll(async () => (await pendingCounter(kPage)) - (await cards.count()), { timeout: 20_000 }).toBe(0);
      expect(await pendingCounter(kPage)).toBeGreaterThanOrEqual(1);

      // Nota del pedido visible para cocina (ver RESULTS.md si falla: bug de la app).
      await expect.soft(pendingCard, "la nota del pedido debe llegar a la comanda").toContainText(ORDER_NOTE);

      // Cocina: Comanda lista -> sale de la pantalla de pendientes.
      await pendingCard.getByRole("button", { name: "Comanda lista" }).click();
      await expect(pendingCard).toHaveCount(0, SLOW);

      // Historial: está como lista y se puede devolver a preparación.
      await kPage.getByRole("link", { name: "Historial" }).click();
      await expect(kPage).toHaveURL(/\/kitchen\/history/);
      const doneCard = ticketCard(kPage, customer);
      await expect(doneCard).toHaveCount(1);
      await expect(doneCard).toContainText(/Lista/);
      await doneCard.getByRole("button", { name: "Devolver a preparación" }).click();
      await expect(doneCard).toHaveCount(0, SLOW);

      // Vuelve a pendientes y se marca lista otra vez.
      await kPage.getByRole("link", { name: "Volver a cocina" }).first().click();
      await expect(kPage).toHaveURL(/\/kitchen$/);
      // Soft nav back to /kitchen should already show the returned ticket (live refetch).
      // If it is stale, record the bug and continue with a hard reload.
      await expect.soft(ticketCard(kPage, customer), "el ticket devuelto debe verse al volver a cocina sin recargar").toHaveCount(1, { timeout: 10_000 });
      await kPage.goto("/kitchen");
      await expect(ticketCard(kPage, customer)).toHaveCount(1, SLOW);
      // A click right after a hard navigation can land before hydration: retry until it sticks.
      await expect(async () => {
        const ready = ticketCard(kPage, customer).getByRole("button", { name: "Comanda lista" });
        if (await ready.count()) await ready.click();
        await expect(ticketCard(kPage, customer)).toHaveCount(0, { timeout: 8_000 });
      }).toPass({ timeout: 60_000 });
      await kPage.goto("/kitchen/history");
      await expect(ticketCard(kPage, customer)).toHaveCount(1, SLOW);

      // Dueño: entregar el pedido en el tablero (sale de "En cocina"/"Listos").
      await oPage.goto("/orders");
      const boardCard = ticketCard(oPage, customer);
      await expect(boardCard).toHaveCount(1);
      // The delivery commits after a 5 s undo window; leaving earlier would drop it.
            const clickedAt = Date.now();
      const committed = oPage.waitForResponse((r) => r.request().method() === "POST" && Date.now() - clickedAt > 4_800, { timeout: 60_000 });
      await boardCard.getByRole("button", { name: "Entregado" }).click();
      // The order is not READY (the KDS ticket is independent), so the board asks for confirmation.
      const confirmDelivery = oPage.getByRole("button", { name: "Sí, ya lo entregué" });
      if (await confirmDelivery.isVisible({ timeout: 5_000 }).catch(() => false)) await confirmDelivery.click();
      await committed;
      await expect(boardCard).toHaveCount(0, SLOW);
      await expect(async () => {
        await oPage.reload();
        await expect(ticketCard(oPage, customer)).toHaveCount(0, { timeout: 5_000 });
      }).toPass({ timeout: 45_000 });

      // Dueño: cobrar para que no quede abierto (solo si hay caja abierta).
      await oPage.getByRole("button", { name: new RegExp(customer) }).click();
      const detail = oPage.getByRole("dialog", { name: /^Pedido #\d+ · Para llevar/ });
      await detail.getByRole("button", { name: /^Cobrar/ }).click();
      const sheet = oPage.getByRole("dialog", { name: /^Cobrar · / });
      const noCash = oPage.getByText(/Abrir caja|Sin caja abierta/).first();
      const charge = sheet.getByRole("button", { name: /^Cobrar \$/ });
      await expect(charge.or(noCash)).toBeVisible();
      if (await noCash.isVisible()) {
        testInfo.annotations.push({ type: "pendiente", description: "Sin caja abierta: el pedido queda entregado pero sin cobrar" });
        return;
      }
      await charge.click();
      await sheet.getByRole("button", { name: /^Continuar/ }).click();
      await sheet.getByRole("button", { name: "Exacto" }).click();
      await sheet.getByRole("button", { name: /^Cobrar \$/ }).click();
      const close = sheet.getByRole("button", { name: /Cerrar cuenta y liberar|^Listo$/ });
      await expect(close.first()).toBeVisible(SLOW);
      await close.first().click();
      await expect(sheet).toBeHidden(SLOW);

      // Reopening the charge sheet shows the bill as paid and closed: nothing stays open.
      await oPage.reload();
      await oPage.getByRole("button", { name: new RegExp(customer) }).click();
      await expect(detail).toBeVisible();
      await detail.getByRole("button", { name: /^Cobrar/ }).click();
      await expect(sheet).toContainText("Cuenta finalizada", SLOW);
    } finally {
      await owner.context.close();
      await kitchen.context.close();
    }
  });

  test("caso 15 (manual): pantalla completa del KDS no deja botones inutilizables al salir", () => {
    test.skip(true, "Manual según M18 §10 caso 15: probar con Esc y el botón de salir en una pantalla real");
  });
});
