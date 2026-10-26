import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const qaEnvPath = path.resolve(__dirname, ".env.qa.local");
if (existsSync(qaEnvPath)) {
  process.loadEnvFile(qaEnvPath);
}

// E2E_BASE_URL apunta a un servidor ya levantado (p. ej. `next dev -p 3318`).
// Sin ella, Playwright construye y levanta la app en el puerto 3311.
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? "http://localhost:3311";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npm run build && npx next start -p 3311",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
