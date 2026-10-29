// Run against this worktree's dev server only: E2E_BASE_URL=http://localhost:3161.
// The static JSON import is rebuilt by Next dev when fixtures change; always restore it.
const { test, expect } = require("playwright/test");
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const resultsPath = join(root, "data/drift/results.json");
const base = new URL(process.env.E2E_BASE_URL || "http://localhost:3140");
test.describe("Spec Drift static states", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!["localhost", "127.0.0.1"].includes(base.hostname) || base.port !== "3161", "Fixture swaps require this worktree's own Next dev server on port 3161");

  test("placeholder says not run yet and has no findings", async ({ page }) => {
    const saved = readFileSync(resultsPath);
    try {
      writeFileSync(resultsPath, JSON.stringify({ placeholder: true, proposed: 0, verified: 0, dropped: 0, claims: [], rejections: [] }));
      await expect(async () => {
        await page.goto("/modes/drift");
        await expect(page.getByTestId("drift-placeholder")).toContainText("not run yet");
      }).toPass({ timeout: 60_000 });
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Spec Drift" })).toHaveAttribute("href", "/modes/drift");
      await expect(page.locator("article")).toHaveCount(0);
      await expect(page.getByText("whether the code really contradicts the doc is for a human to judge", { exact: false })).toBeVisible();
    } finally { writeFileSync(resultsPath, saved); }
  });

  test("imported answer shows only code-verified references and honest counts at mobile width", async ({ page }) => {
    const saved = readFileSync(resultsPath);
    const scratch = mkdtempSync(join(root, "data/drift/e2e-"));
    try {
      const fake = { docClaim: "Market Brawl", docFile: "game/README.md", codeSymbol: "updateRivalAI", codeFile: "game/src/ai.js", codeLine: 1, whatCodeDoes: "Fake proposed contradiction for browser coverage.", severity: "low" };
      const answer = join(scratch, "answer.json");
      writeFileSync(answer, JSON.stringify({ claims: [fake, { ...fake, docClaim: "INVENTED_QUOTE_MUST_NOT_RENDER" }] }));
      const injected = spawnSync(process.execPath, ["--import", "tsx", "ai/cli/drift.ts", "--results-from", answer], { cwd: root, encoding: "utf8", timeout: 15_000, env: { ...process.env, NEBIUS_API_KEY: "" } });
      expect(injected.status, injected.stderr).toBe(0);
      await expect(async () => {
        await page.goto("/modes/drift");
        await expect(page.getByTestId("drift-results")).toContainText("1 of 2 claims verified by code; 1 dropped");
      }).toPass({ timeout: 60_000 });
      await expect(page.locator("article")).toHaveCount(1);
      await expect(page.getByTestId("drift-results")).toContainText("Imported answer");
      await expect(page.locator("blockquote")).toHaveText(fake.docClaim);
      await expect(page.locator("article")).toContainText("game/src/ai.js:1");
      await expect(page.getByText("INVENTED_QUOTE_MUST_NOT_RENDER")).toHaveCount(0);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { writeFileSync(resultsPath, saved); rmSync(scratch, { recursive: true, force: true }); }
  });
});
