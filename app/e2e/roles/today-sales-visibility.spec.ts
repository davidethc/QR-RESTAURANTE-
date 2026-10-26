import { expect, test } from "@playwright/test";
import { credentialsFor, missingCredentialsReason, newSession } from "../support/qa";

test.describe.configure({ timeout: 240_000 });
const SLOW = { timeout: 90_000 };
const SALES = "Ventas del periodo";

test.describe('Hoy: "Ventas del periodo" visibility by role (P13)', () => {
  test("owner sees the section and choosing 30 días sets ?preset=last30", async ({ browser }) => {
    test.skip(!credentialsFor("owner"), missingCredentialsReason("owner"));
    const { context, page } = await newSession(browser, "owner");
    try {
      await page.goto("/today");
      await expect(page.getByRole("heading", { name: SALES })).toBeVisible(SLOW);
      const range = page.getByRole("radiogroup", { name: "Rango de fechas" }).or(page.getByRole("group", { name: "Rango de fechas" }));
      await expect(range).toBeVisible(SLOW);
      await range.getByText("30 días", { exact: true }).click();
      await expect(page).toHaveURL(/preset=last30/, SLOW);
      await expect(page.getByRole("heading", { name: SALES })).toBeVisible(SLOW);
    } finally {
      await context.close();
    }
  });

  test("waiter does not see the section nor the date filter on /today", async ({ browser }) => {
    test.skip(!credentialsFor("waiter"), missingCredentialsReason("waiter"));
    const { context, page } = await newSession(browser, "waiter");
    try {
      await page.goto("/today");
      await expect(page.getByRole("navigation").first()).toBeVisible(SLOW);
      await expect(page.getByRole("heading", { name: SALES })).toHaveCount(0, SLOW);
      await expect(page.getByText("Rango de fechas")).toHaveCount(0, SLOW);
    } finally {
      await context.close();
    }
  });

  // Case 25: the orders panel should reuse the Hoy date filter (RangeSelector). Today it does not,
  // so this test documents the finding and is expected to fail until the filter exists.
  test("orders page exposes the same date-range filter as Hoy (case 25)", async ({ browser }) => {
    test.skip(!credentialsFor("owner"), missingCredentialsReason("owner"));
    test.fail(true, "Finding: /orders has no date filter (RangeSelector is only used by Hoy and Reportes)");
    const { context, page } = await newSession(browser, "owner");
    try {
      await page.goto("/orders");
      await expect(page.getByRole("radiogroup", { name: "Rango de fechas" }).or(page.getByRole("group", { name: "Rango de fechas" }))).toBeVisible({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  });
});
