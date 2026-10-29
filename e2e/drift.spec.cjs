// Run against this worktree's dev server only: E2E_BASE_URL=http://localhost:3161.
// The static JSON import is rebuilt by Next dev when fixtures change; always restore it.
const { test, expect } = require("playwright/test");
const { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const resultsPath = join(root, "data/drift/results.json");
const judgePath = join(root, "data/drift/judge.json");
// The judge snapshot is read-only, including during fixture tests.
const readJudge = () => existsSync(judgePath) ? JSON.parse(readFileSync(judgePath, "utf8")) : undefined;
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

  test("recorded second opinion groups original candidates and collapses disagreements", async ({ page }) => {
    const results = JSON.parse(readFileSync(resultsPath, "utf8"));
    test.skip(results.placeholder || !results.claims.length, "Needs a recorded claims snapshot");
    const judge = readJudge();
    const groups = { REAL_DRIFT: [], DOC_VAGUE: [], NOT_DRIFT: [], unchecked: [] };
    results.claims.forEach((claim, index) => {
      const judgment = judge?.verdicts?.[String(index + 1)];
      const key = ["REAL_DRIFT", "DOC_VAGUE", "NOT_DRIFT"].includes(judgment?.verdict) ? judgment.verdict : "unchecked";
      groups[key].push({ claim, index: index + 1, judgment });
    });
    const summary = `${groups.REAL_DRIFT.length} of ${results.claims.length} confirmed, ${groups.DOC_VAGUE.length} vague, ${groups.NOT_DRIFT.length} not drift`;
    await expect(async () => {
      await page.goto("/modes/drift");
      await expect(page.getByTestId("drift-judge-counts")).toContainText(summary);
      await expect(page.locator("article")).toHaveCount(results.claims.length);
    }).toPass({ timeout: 60_000 });

    await expect(page.getByTestId("drift-confirmed").getByRole("heading", { name: "Confirmed by a second model", exact: true })).toBeVisible();
    await expect(page.getByTestId("drift-vague").getByRole("heading", { name: "Doc wording is vague", exact: true })).toBeVisible();
    expect(await page.locator("[data-drift-group]").evaluateAll(nodes => nodes.map(node => node.dataset.driftGroup))).toEqual([
      "confirmed", "vague", "not-drift", ...(groups.unchecked.length ? ["unchecked"] : []),
    ]);
    await expect(page.getByText("code verified existence of the quote and symbol", { exact: false })).toBeVisible();
    await expect(page.getByText("one second opinion, not ground truth", { exact: false })).toBeVisible();
    if (judge?.judge) await expect(page.getByTestId("drift-judge-source")).toContainText(judge.judge);

    const disagreements = page.getByTestId("drift-not-drift");
    await expect(disagreements).not.toHaveAttribute("open");
    for (const { index } of groups.NOT_DRIFT) {
      await expect(disagreements.locator(`[data-claim-index="${index}"]`)).not.toBeVisible();
    }
    await disagreements.locator("summary").click();
    await expect(disagreements).toHaveAttribute("open", "");
    for (const [verdict, testId] of [["REAL_DRIFT", "drift-confirmed"], ["DOC_VAGUE", "drift-vague"], ["NOT_DRIFT", "drift-not-drift"], ["unchecked", "drift-unchecked"]]) {
      const articles = page.getByTestId(testId).locator("article");
      await expect(articles).toHaveCount(groups[verdict].length);
      for (const { claim, index, judgment } of groups[verdict]) {
        const article = articles.filter({ has: page.getByRole("heading", { name: `Candidate ${index}: ${claim.codeSymbol}`, exact: true }) });
        await expect(article).toBeVisible();
        await expect(article).toContainText(judgment?.reason || "not second-checked");
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("a claim without a judge index renders as not second-checked", async ({ page }) => {
    const saved = readFileSync(resultsPath);
    try {
      const snapshot = JSON.parse(saved.toString("utf8"));
      const judge = readJudge();
      const lastIndex = Math.max(0, ...Object.keys(judge?.verdicts || {}).map(Number).filter(Number.isSafeInteger));
      const fixture = {
        docClaim: "Fixture quote", docFile: "docs/design.md", codeSymbol: "uncheckedFixture",
        codeFile: "game/src/ai.js", codeLine: 1, codeLineText: "// Fixture only",
        whatCodeDoes: "Fixture proposal, not a finding.", severity: "low",
      };
      const claims = Array.from({ length: lastIndex + 1 }, () => fixture);
      writeFileSync(resultsPath, JSON.stringify({ ...snapshot, placeholder: false, source: "injected", claims, proposed: claims.length, verified: claims.length, dropped: 0 }));
      await expect(async () => {
        await page.goto("/modes/drift");
        await expect(page.getByTestId("drift-unchecked").locator(`[data-claim-index="${lastIndex + 1}"]`)).toContainText("not second-checked");
      }).toPass({ timeout: 60_000 });
      await expect(page.locator("article")).toHaveCount(claims.length);
    } finally { writeFileSync(resultsPath, saved); }
  });
});
