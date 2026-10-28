// Browser end-to-end suite. Run command and setup are in e2e/README.md.
const { defineConfig } = require("playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: "*.spec.cjs",
  outputDir: "test-results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 2, // next dev compiles routes on first hit; more workers mostly wait on it
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3140",
    channel: process.env.E2E_CHANNEL ?? "chrome", // system Chrome; set E2E_CHANNEL= to use Playwright's bundled Chromium
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
});
