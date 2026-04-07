import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Diffract end-to-end tests.
 *
 * Local run (requires built UI):  cd ui && npm run build && npm run start
 * Docker run:  docker build -f e2e/Dockerfile -t diffract-e2e . && docker run --rm diffract-e2e
 * CI:          See .github/workflows/e2e.yml
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start the UI dev server when running outside Docker / CI.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build --prefix ui && npm run start --prefix ui",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
