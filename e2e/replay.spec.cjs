// The embedded 3D replay: badge, bug ticker for seed 634310 (p0537 round 1), and the re-simulated result vs the recorded one.
const { test, expect } = require("playwright/test");
const { watch, tokenFor, shot } = require("./helpers.cjs");

// Recorded in data/run-main/runs.jsonl for p0537 round 1.
const RECORDED = { seed: 634310, out: "loss", t: 99, hp: [18, 98], airborneAt: 13.8 };

test("recorded link: game loads and badge says build as recorded", async ({ page }) => {
  const w = watch(page);
  await page.goto("/replay?key=p0537%3A1");
  await expect(page.locator("h1")).toHaveText(/round 1 · loss/);
  await expect(page.locator(".kv")).toContainText(`loss in ${RECORDED.t.toFixed(1)} s · hp ${RECORDED.hp[0]} vs ${RECORDED.hp[1]}`);
  const game = page.frameLocator("iframe.game-frame");
  await expect(game.locator("#badge")).toHaveText(`seed ${RECORDED.seed} · build as recorded (before the bug fixes) · deterministic re-simulation`, { timeout: 45_000 });
  await expect(game.locator("#pname")).not.toHaveText("PLAYER");
  await page.waitForTimeout(2000);
  await shot(page, "replay-p0537-r1");
  expect(w.problems()).toEqual([]);
});

test("/replay does not forward speed= to the embedded game", async ({ page }) => {
  await page.goto("/replay?key=p0537%3A1&speed=8");
  const src = await page.locator("iframe.game-frame").getAttribute("src");
  test.info().annotations.push({ type: "iframe-src", description: src.slice(0, 80) });
  expect(src).not.toContain("speed=");
});

test("seed 634310 at speed=8: ticker shows airborne bug near 13.8 s and result matches the recording", async ({ page }) => {
  test.setTimeout(240_000);
  const t = await tokenFor(page, "p0537:1");
  const w = watch(page);
  await page.goto(`/game/replay.html?t=${t}&speed=8`);
  await expect(page.locator("#badge")).toContainText("build as recorded (before the bug fixes)", { timeout: 45_000 });

  // Record every bug line the ticker ever shows (it keeps only the last 5).
  await page.evaluate(() => {
    window.__bugs = [];
    new MutationObserver(() => document.querySelectorAll("#ticker .bug").forEach((d) => { if (!window.__bugs.includes(d.textContent)) window.__bugs.push(d.textContent); }))
      .observe(document.getElementById("ticker"), { childList: true });
  });
  await expect.poll(() => page.evaluate(() => window.__bugs.find((b) => b.includes("airborne")) ?? null), { timeout: 90_000 }).not.toBeNull();
  const airborne = await page.evaluate(() => window.__bugs.find((b) => b.includes("airborne")));
  await page.locator("#ticker").screenshot({ path: `${__dirname}/screenshots/replay-ticker-airborne.png` });
  await shot(page, "replay-speed8-airborne", { fullPage: false });
  const at = parseFloat(airborne);
  test.info().annotations.push({ type: "airborne", description: airborne });
  expect(Math.abs(at - RECORDED.airborneAt)).toBeLessThanOrEqual(0.2);
  expect(airborne).toMatch(/BUG\? airborne too long/);

  await expect(page.locator("#end")).toHaveClass(/show/, { timeout: 180_000 });
  const title = await page.locator("#endTitle").textContent();
  const detail = await page.locator("#endDetail").textContent();
  const bugs = await page.evaluate(() => window.__bugs);
  test.info().annotations.push({ type: "end", description: `${title} | ${detail}` }, { type: "bug-lines", description: JSON.stringify(bugs) });
  await shot(page, "replay-speed8-end", { fullPage: false });
  expect(title).toBe("CPU WINS"); // recorded out = loss
  const [, secs, hp0, hp1] = detail.match(/^([\d.]+)s · hp (\d+) \/ (\d+)/);
  expect({ t: +secs, hp: [+hp0, +hp1] }).toEqual({ t: RECORDED.t, hp: RECORDED.hp });
  expect(w.problems()).toEqual([]);
});

test("seek with at=99 gives the same end state without real-time playback", async ({ page }) => {
  const t = await tokenFor(page, "p0537:1");
  await page.goto(`/game/replay.html?t=${t}&at=99`);
  await expect(page.locator("#end")).toHaveClass(/show/, { timeout: 60_000 });
  const detail = await page.locator("#endDetail").textContent();
  test.info().annotations.push({ type: "seek-end", description: detail });
  expect(detail).toMatch(new RegExp(`^${RECORDED.t}s · hp ${RECORDED.hp[0]} / ${RECORDED.hp[1]}`));
});

test("game controls: pause, speed buttons, restart", async ({ page }) => {
  const t = await tokenFor(page, "p0537:1");
  await page.goto(`/game/replay.html?t=${t}`);
  await expect(page.locator("#badge")).not.toBeEmpty({ timeout: 45_000 });
  await page.locator("#play").click();
  await expect(page.locator("#play")).toHaveText("Play");
  const c1 = await page.locator("#clock").textContent();
  await page.waitForTimeout(1000);
  expect(await page.locator("#clock").textContent()).toBe(c1);
  await page.locator("[data-speed='4']").click();
  await expect(page.locator("[data-speed='4']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-speed='1']")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#play").click();
  await page.locator("#restart").click();
  await expect(page.locator("#clock")).toHaveText(/^(99|98|97)$/);
});

test("audit round 2: a shipped-game replay (empty tuning) is NOT badged as the recorded build", async ({ page }) => {
  const re = /\[after[^\]]*\]\(https:\/\/[^)]+\/replay\?t=([A-Za-z0-9_-]+)\)/;
  const proof = require("node:fs").readFileSync(require("node:path").join(__dirname, "../docs/PROOF.md"), "utf8");
  const token = proof.match(re)[1];
  await page.goto(`/replay?t=${token}`);
  await expect(page.frameLocator("iframe.game-frame").locator("#badge")).toContainText("shipped tuning", { timeout: 45_000 });
  await expect(page.frameLocator("iframe.game-frame").locator("#badge")).not.toContainText("before the bug fixes");
});
