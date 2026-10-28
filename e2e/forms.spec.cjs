// Repro, Balance and Eyes forms. Validation tests never reach a model.
// Real model calls run only with E2E_REAL=1: 1 Repro, 1 Balance, 1 Eyes call per run (budget: 3 / 2 / 1).
const { test, expect } = require("playwright/test");
const { watch, shot, REAL } = require("./helpers.cjs");

const FORMS = [
  { url: "/modes/repro", label: "Bug report", cta: "Find it in the crowd", endpoint: "/api/repro", field: "report", slug: "repro" },
  { url: "/modes/balance", label: "Patch notes", cta: "Translate to tuning", endpoint: "/api/balance", field: "notes", slug: "balance" },
];

for (const f of FORMS) {
  test.describe(f.slug, () => {
    test("empty and whitespace input cannot be submitted", async ({ page }) => {
      let posted = 0;
      page.on("request", (r) => { if (r.url().endsWith(f.endpoint)) posted++; });
      await page.goto(f.url);
      const box = page.getByLabel(f.label, { exact: true }), btn = page.getByRole("button", { name: f.cta });
      await expect(box).toHaveAttribute("required", "");
      await expect(btn).toBeDisabled();
      await box.fill("    \n  ");
      await expect(btn).toBeDisabled();
      await box.press("Control+Enter");
      expect(posted).toBe(0);
    });

    test("4001 characters is capped at 4000 in the textarea", async ({ page }) => {
      await page.goto(f.url);
      const box = page.getByLabel(f.label, { exact: true });
      await box.fill("a".repeat(4001));
      // fill() bypasses maxlength in Chromium; typing does not. Check both.
      const filled = (await box.inputValue()).length;
      await box.fill("");
      await box.pressSequentially("b".repeat(10));
      await box.evaluate((el) => { el.focus(); });
      await page.keyboard.insertText("c".repeat(3995));
      const typed = (await box.inputValue()).length;
      test.info().annotations.push({ type: "lengths", description: JSON.stringify({ filled, typed, maxLength: await box.getAttribute("maxlength") }) });
      await expect(box).toHaveAttribute("maxlength", "4000");
      expect(typed).toBeLessThanOrEqual(4000);
    });

    test("API refuses empty, non-JSON and 4001-char bodies before any model call", async ({ request }) => {
      const empty = await request.post(f.endpoint, { data: { [f.field]: "   " } });
      expect(empty.status()).toBe(400);
      expect((await empty.json()).error).toContain("non-empty string");
      const notJson = await request.post(f.endpoint, { headers: { "content-type": "application/json" }, data: "{oops" });
      expect(notJson.status()).toBe(400);
      const long = await request.post(f.endpoint, { data: { [f.field]: "a".repeat(4001) } });
      expect(long.status()).toBe(413);
      expect((await long.json()).error).toContain("limited to 4000");
      const wrongType = await request.post(f.endpoint, { data: { [f.field]: 42 } });
      expect(wrongType.status()).toBe(400);
    });

    test("over-long input forced past maxlength shows the server's 413 as a readable error", async ({ page }) => {
      await page.goto(f.url);
      const box = page.getByLabel(f.label, { exact: true });
      await box.evaluate((el) => el.removeAttribute("maxlength"));
      await box.fill("a".repeat(4001));
      await page.getByRole("button", { name: f.cta }).click();
      await expect(page.locator(".notice-error")).toHaveText(/limited to 4000 characters\. \(HTTP 413\)/);
      await shot(page, `${f.slug}-413`);
    });

    test("example button fills a valid report", async ({ page }) => {
      await page.goto(f.url);
      await page.getByRole("button", { name: "Use an example" }).click();
      await expect(page.getByLabel(f.label, { exact: true })).not.toHaveValue("");
      await expect(page.getByRole("button", { name: f.cta })).toBeEnabled();
    });
  });
}

test.describe("real model calls", () => {
  test.skip(!REAL, "set E2E_REAL=1 to spend model credits");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("repro: valid example writes an oracle and links matching rounds", async ({ page }) => {
    const w = watch(page);
    await page.goto("/modes/repro");
    await page.getByRole("button", { name: "Use an example" }).click();
    const started = Date.now();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/repro"), { timeout: 170_000 }),
      page.getByRole("button", { name: "Find it in the crowd" }).click(),
    ]);
    await expect(page.getByRole("button", { name: "Asking the model..." })).toHaveCount(0, { timeout: 170_000 });
    const ms = Date.now() - started;
    test.info().annotations.push({ type: "repro", description: JSON.stringify({ status: res.status(), ms }) });
    await shot(page, "repro-real");
    if (res.status() === 429) { await expect(page.locator(".notice-error")).toContainText("HTTP 429"); return; }
    expect(res.status()).toBe(200);
    const body = await res.json();
    test.info().annotations.push({ type: "repro-body", description: JSON.stringify({ atoms: body.oracle.atoms, combine: body.oracle.combine, total: body.total, matched: body.matched, examples: body.examples.slice(0, 5).map((e) => `${e.p}:${e.round}`) }) });
    await expect(page.getByRole("heading", { name: "Oracle (written by Nemotron Super)" })).toBeVisible();
    await expect(page.locator("ol li").first()).toBeVisible();
    if (body.matched) {
      const link = page.locator("a.chip[href^='/replay']").first();
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/replay\?/);
      await expect(page.frameLocator("iframe.game-frame").locator("#badge")).toContainText("deterministic re-simulation", { timeout: 45_000 });
    }
    expect(w.problems()).toEqual([]);
  });

  test("balance: valid patch notes become in-range tuning", async ({ page }) => {
    await page.goto("/modes/balance");
    await page.getByRole("button", { name: "Use an example" }).click();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/balance"), { timeout: 170_000 }),
      page.getByRole("button", { name: "Translate to tuning" }).click(),
    ]);
    await expect(page.getByRole("button", { name: "Asking the model..." })).toHaveCount(0, { timeout: 170_000 });
    await shot(page, "balance-real");
    if (res.status() === 429) { await expect(page.locator(".notice-error")).toContainText("HTTP 429"); return; }
    expect(res.status()).toBe(200);
    const rows = await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent)));
    test.info().annotations.push({ type: "balance-rows", description: JSON.stringify(rows) });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r[4], `allowed range known for ${r[0]}`).not.toBe("unknown key");
      const [min, max] = r[4].split(" to ").map(Number), after = Number(r[2]);
      expect(after).toBeGreaterThanOrEqual(min);
      expect(after).toBeLessThanOrEqual(max);
    }
  });

  test("eyes: one Super-VL call on p0537 round 1", async ({ page }) => {
    const w = watch(page);
    await page.goto("/replay?key=p0537%3A1");
    await expect(page.frameLocator("iframe.game-frame").locator("#badge")).not.toBeEmpty({ timeout: 45_000 });
    await expect(page.locator(".panel", { hasText: "Eyes:" })).toContainText("at 11.3s, 13.8s, 15.3s");
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/eyes"), { timeout: 170_000 }),
      page.getByRole("button", { name: "Look at 3 frames" }).click(),
    ]);
    await expect(page.getByRole("button", { name: "Capturing and asking..." })).toHaveCount(0, { timeout: 170_000 });
    await page.locator(".panel", { hasText: "Eyes:" }).screenshot({ path: `${__dirname}/screenshots/eyes-real.png` });
    if (res.status() === 429) return;
    expect(res.status()).toBe(200);
    const imgs = page.locator("img[alt^='Frame ']");
    await expect(imgs).toHaveCount(3);
    const text = await page.locator(".panel", { hasText: "Eyes:" }).locator("[aria-live] > p").first().textContent();
    test.info().annotations.push({ type: "eyes-answer", description: text });
    expect(text.length).toBeGreaterThan(20);
    expect(w.problems()).toEqual([]);
  });
});
