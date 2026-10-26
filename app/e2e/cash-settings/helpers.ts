import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { credentialsFor, missingCredentialsReason } from "../support/qa";

export const QA_NOTE = "QA E2E";

/** Owner session that tolerates cold `next dev` compiles after login. */
export async function ownerSession(browser: Browser) {
  const creds = credentialsFor("owner");
  if (!creds) throw new Error(missingCredentialsReason("owner"));
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Correo").fill(creds.email);
  await page.getByLabel("Contraseña").fill(creds.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 90_000 });
  return { context, page };
}

/** Presses digits on the on-screen numeric keypad inside `scope`. */
export async function typeOnKeypad(scope: Locator, digits: string): Promise<void> {
  const pad = scope.getByRole("group", { name: "Teclado numérico" });
  for (const d of digits) {
    await pad.getByRole("button", { name: d, exact: true }).click();
  }
}

/** True when /cash shows the "open register" gate instead of the workspace. */
export async function cashIsClosed(page: Page): Promise<boolean> {
  await page.goto("/cash");
  const gate = page.getByRole("heading", { name: "La caja está cerrada" });
  const status = page.getByRole("region", { name: "Estado de la caja" });
  await expect(gate.or(status)).toBeVisible({ timeout: 60_000 });
  return gate.isVisible();
}

/** Opens the register from the gate, keeping the suggested opening float. */
export async function openRegisterFromGate(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Abrir / }).first().click();
  await expect(page.getByRole("region", { name: "Estado de la caja" })).toBeVisible({ timeout: 30_000 });
}

/** Restaurant-local date (YYYY-MM-DD) as the promotion editor sees it, plus the next day. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
