import { expect, test, type Page } from "@playwright/test";

/**
 * QA en vivo: pedido del cliente -> aparece al mesero en tiempo real -> los
 * estados vuelven al cliente. Corre contra PRODUCCIÓN (restaurante aislado
 * `monky-qa` / demo Omm Siri, mesa 4), por eso NO se ejecuta en CI: crea un
 * pedido real. Requiere las variables de app/.env.qa.local.
 *
 * Portado desde el script exploratorio rt.mjs (mismo flujo y mediciones de
 * latencia), ahora como test de Playwright con credenciales por entorno.
 */

const RESTAURANT_SLUG = "omm-siri";
const MESA = 4;

test.describe("Pedido en tiempo real: cliente -> mesero -> cliente", () => {
  test("el pedido del cliente aparece al mesero sin recargar y los cambios de estado vuelven al cliente", async ({
    browser,
  }, testInfo) => {
    test.skip(!process.env.QA_STAFF_PASSWORD, "Requiere credenciales QA en app/.env.qa.local");
    test.setTimeout(180_000);

    const waiterEmail = process.env.QA_WAITER_EMAIL;
    const staffPassword = process.env.QA_STAFF_PASSWORD;
    const tableToken = process.env.QA_TABLE_4_TOKEN;
    if (!waiterEmail || !staffPassword || !tableToken) {
      throw new Error(
        "Faltan QA_WAITER_EMAIL, QA_STAFF_PASSWORD o QA_TABLE_4_TOKEN en app/.env.qa.local"
      );
    }

    const staffCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const custCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const staff = await staffCtx.newPage();
    const cust = await custCtx.newPage();

    const consoleErrors: string[] = [];
    for (const [name, page] of [
      ["mesero", staff],
      ["cliente", cust],
    ] as const satisfies ReadonlyArray<readonly [string, Page]>) {
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${name}: ${m.text()}`));
      page.on("pageerror", (e) => consoleErrors.push(`${name} pageerror: ${e.message}`));
      page.on("response", (r) => r.status() >= 500 && consoleErrors.push(`${name} ${r.status()} ${r.url()}`));
    }

    let websocketCount = 0;
    staff.on("websocket", (ws) => {
      websocketCount++;
      console.log("mesero websocket abierto:", ws.url().split("?")[0]);
    });

    // Espera a que el body del cliente muestre "<label> (paso actual)" —
    // así se marca el paso en curso en el tracker de pedido del cliente.
    const waitStep = async (label: string, timeout = 45_000) => {
      const re = new RegExp(`${label}\\s*\\(paso actual\\)`);
      await expect(async () => {
        const text = await cust.evaluate(() => document.body.textContent || "");
        expect(re.test(text)).toBe(true);
      }).toPass({ timeout, intervals: [50] });
    };

    try {
      await test.step("1. Mesero inicia sesión y abre Comandas", async () => {
        await staff.goto("/login");
        await staff.getByLabel(/correo|email/i).fill(waiterEmail);
        await staff.getByLabel(/contraseña|password/i).fill(staffPassword);
        await staff.getByRole("button", { name: /ingresar|iniciar|entrar/i }).click();
        await staff.waitForURL(/\/(orders|tables|kitchen)/, { timeout: 20_000 });
        await staff.goto("/orders");
        await staff.waitForLoadState("networkidle");
        await staff.waitForTimeout(3_000); // tiempo para que Realtime se suscriba
      });

      const t0 = await test.step("2. Cliente escanea el QR de la mesa y arma su pedido", async () => {
        await cust.goto(`/scan/${tableToken}`);
        await cust.waitForURL(new RegExp(`/r/${RESTAURANT_SLUG}/${MESA}`), { timeout: 20_000 });
        await cust.getByPlaceholder(/buscar/i).first().fill("cafe tinto");
        await cust.waitForTimeout(800);
        await testInfo.attach("c0-busqueda", { body: await cust.screenshot(), contentType: "image/png" });
        await cust.getByText("Café tinto", { exact: true }).first().click();
        await cust.getByRole("button", { name: /agregar .* al pedido/i }).click();
        await cust.getByRole("button", { name: /ver carrito/i }).click();
        await cust.getByRole("button", { name: /^enviar pedido$/i }).first().click();
        await testInfo.attach("c1-confirm", { body: await cust.screenshot(), contentType: "image/png" });

        const confirmButton = cust.getByRole("alertdialog").getByRole("button", { name: /enviar pedido/i });
        const sentAt = Date.now();
        await confirmButton.click();
        return sentAt;
      });

      await test.step("3. Mide cuánto tarda en aparecerle al mesero SIN recargar", async () => {
        const card = staff.getByText(`Mesa ${MESA}`).first();
        await card.waitFor({ timeout: 30_000 });
        const staffLatencyMs = Date.now() - t0;
        console.log(`el pedido apareció en el panel del mesero en ${staffLatencyMs} ms (sin recargar)`);
        await testInfo.attach("s1-nuevo", { body: await staff.screenshot(), contentType: "image/png" });
        expect(staffLatencyMs, "el pedido debe aparecer al mesero en tiempo real, sin recargar").toBeLessThan(
          30_000
        );

        await cust.waitForURL(/\/order\//, { timeout: 20_000 });
        await waitStep("Pedido recibido");
      });

      await test.step('4. Mesero acepta -> mide cuánto tarda el cliente en ver "Preparando"', async () => {
        const t1 = Date.now();
        await staff.getByRole("button", { name: /^aceptar$/i }).first().click();
        await waitStep("Preparando");
        const acceptedLatencyMs = Date.now() - t1;
        console.log(`el cliente vio el cambio de estado en ${acceptedLatencyMs} ms`);
        await testInfo.attach("c2-tracker", { body: await cust.screenshot(), contentType: "image/png" });
        expect(acceptedLatencyMs, "el cliente debe ver 'Preparando' en tiempo real").toBeLessThan(45_000);
      });

      await test.step("5. Mesero lo marca listo y entregado (flujo completo)", async () => {
        await staff.getByRole("tab", { name: /preparando/i }).click();
        await staff.getByRole("button", { name: /marcar listo/i }).first().click();
        const t2 = Date.now();
        await waitStep("Listo");
        const readyLatencyMs = Date.now() - t2;
        console.log(`el cliente vio "Listo" en ${readyLatencyMs} ms`);
        expect(readyLatencyMs, "el cliente debe ver 'Listo' en tiempo real").toBeLessThan(45_000);

        await staff.getByRole("tab", { name: /listos/i }).click();
        await staff.getByRole("button", { name: /marcar entregado/i }).first().click();
        await staff.waitForTimeout(1_500);
        await testInfo.attach("s2-final", { body: await staff.screenshot(), contentType: "image/png" });
        await cust.waitForTimeout(3_000);
        await testInfo.attach("c3-final", { body: await cust.screenshot(), contentType: "image/png" });
      });

      console.log("websockets del mesero:", websocketCount);
      expect(websocketCount, "el mesero debe tener al menos una suscripción realtime abierta").toBeGreaterThan(0);
      expect(consoleErrors, `errores de consola/5xx: ${JSON.stringify(consoleErrors)}`).toEqual([]);
    } finally {
      await staffCtx.close();
      await custCtx.close();
    }
  });
});
