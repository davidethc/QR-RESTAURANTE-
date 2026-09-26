import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const qaEnvPath = path.resolve(__dirname, ".env.qa.local");
if (existsSync(qaEnvPath)) {
  process.loadEnvFile(qaEnvPath);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3311",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "npm run build && npx next start -p 3311",
    url: "http://localhost:3311",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
