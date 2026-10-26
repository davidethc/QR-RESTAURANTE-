import { expect, type Browser, type Page } from "@playwright/test";

/** Único restaurante contra el que corre esta suite. Nunca `omm-siri`. */
export const QA_SLUG = "monky-qa";

export type QaRole = "owner" | "waiter" | "kitchen";

const EMAIL_VARS: Record<QaRole, string> = {
  owner: "QA_MONKY_OWNER_EMAIL",
  waiter: "QA_MONKY_WAITER_EMAIL",
  kitchen: "QA_MONKY_KITCHEN_EMAIL",
};

/** Devuelve las credenciales QA del rol o null si faltan variables (el test se omite). */
export function credentialsFor(role: QaRole): { email: string; password: string } | null {
  const email = process.env[EMAIL_VARS[role]];
  const password = process.env.QA_MONKY_PASSWORD;
  return email && password ? { email, password } : null;
}

export function missingCredentialsReason(role: QaRole): string {
  return `Faltan ${EMAIL_VARS[role]} o QA_MONKY_PASSWORD en app/.env.qa.local`;
}

export function tableToken(n: number): string | null {
  return process.env[`QA_MONKY_TABLE_${n}_TOKEN`] ?? null;
}

export async function login(page: Page, role: QaRole): Promise<void> {
  const creds = credentialsFor(role);
  if (!creds) throw new Error(missingCredentialsReason(role));
  await page.goto("/login");
  await page.getByLabel("Correo").fill(creds.email);
  await page.getByLabel("Contraseña").fill(creds.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Contexto nuevo (sesión aislada) ya autenticado con el rol dado. */
export async function newSession(browser: Browser, role: QaRole) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await login(page, role);
  return { context, page };
}
