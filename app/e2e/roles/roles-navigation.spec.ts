import { expect, test } from "@playwright/test";
import { credentialsFor, missingCredentialsReason, newSession, type QaRole } from "../support/qa";

// Sidebar links per role, derived from lib/permissions.ts (read-only checks, no data is touched).
const ALL_LINKS = [
  "Hoy", "Pedidos", "Cocina", "Mesas", "Caja", "Disponibilidad",
  "Ventas", "Carta", "Reportes", "Personal", "Historial de seguridad", "Configuración",
];

const visibleLinks: Record<QaRole, string[]> = {
  owner: ALL_LINKS,
  waiter: ["Hoy", "Pedidos", "Mesas", "Disponibilidad"],
  kitchen: ["Hoy", "Cocina", "Disponibilidad"],
};

const landing: Record<QaRole, RegExp> = {
  owner: /\/today$/,
  waiter: /\/tables/,
  kitchen: /\/kitchen/,
};

test.describe.configure({ timeout: 240_000 });
const SLOW = { timeout: 90_000 };

test.describe("Roles: landing, guards and navigation (monky-qa)", () => {
  for (const role of ["owner", "waiter", "kitchen"] as const) {
    test(`${role} lands on their page and the nav hides what the role cannot use (case 19)`, async ({ browser }) => {
      test.skip(!credentialsFor(role), missingCredentialsReason(role));
      const { context, page } = await newSession(browser, role);
      try {
        await expect(page).toHaveURL(landing[role], SLOW);
        // The client-side redirect after login can leave the dev server rendering for a long time
        // (see RESULTS.md, finding F1); reload the landing page so the nav assertions start from a settled page.
        await page.goto(page.url());
        const nav = page.getByRole("navigation");
        for (const label of ALL_LINKS) {
          const link = nav.getByRole("link", { name: new RegExp(`^${label}( \\d+.*)?$`) });
          if (visibleLinks[role].includes(label)) {
            await expect(link, `${role} should see "${label}"`).toBeVisible(SLOW);
          } else {
            await expect(link, `${role} should not see "${label}"`).toHaveCount(0, SLOW);
          }
        }
      } finally {
        await context.close();
      }
    });
  }

  test("waiter is sent away from /reports and /security", async ({ browser }) => {
    test.skip(!credentialsFor("waiter"), missingCredentialsReason("waiter"));
    const { context, page } = await newSession(browser, "waiter");
    try {
      for (const path of ["/reports", "/security"]) {
        await page.goto(path);
        await expect(page).not.toHaveURL(new RegExp(path), SLOW);
        await expect(page).toHaveURL(/\/(tables|orders|today)/, SLOW);
      }
    } finally {
      await context.close();
    }
  });

  test("kitchen is bounced from /orders to /kitchen and from /reports and /security to /today", async ({ browser }) => {
    test.skip(!credentialsFor("kitchen"), missingCredentialsReason("kitchen"));
    const { context, page } = await newSession(browser, "kitchen");
    try {
      await page.goto("/orders");
      await expect(page).toHaveURL(/\/kitchen/, SLOW);
      // Kitchen has the "home" permission, so blocked business routes fall back to /today (lib/permissions.ts).
      for (const path of ["/reports", "/security"]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/today/, SLOW);
        await expect(page).not.toHaveURL(new RegExp(path), SLOW);
      }
    } finally {
      await context.close();
    }
  });
});
