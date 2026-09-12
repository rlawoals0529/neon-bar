import { defineConfig, devices } from "@playwright/test";

/**
 * Port 4188, and it is not arbitrary.
 *
 * Four repos here shared two ports with `reuseExistingServer`, which produced a fully green
 * run against a DIFFERENT app twice before anyone noticed. Every repo now has its own port,
 * and e2e/contrast.spec.ts opens by asserting which document answered.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4188", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4188/preview/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
