// Every route loads with HTTP 200, the right heading, and no console errors or failed requests (iframes included).
const { test, expect } = require("playwright/test");
const { watch, shot } = require("./helpers.cjs");

const ROUTES = [
  { name: "home", url: "/", h1: /synthetic players/ },
  { name: "bugs", url: "/bugs", h1: "Bugs the crowd found" },
  { name: "exploit", url: "/modes/exploit", h1: "What strategy breaks the game?" },
  { name: "repro", url: "/modes/repro", h1: "Turn a bug report into a replay." },
  { name: "balance", url: "/modes/balance", h1: "If you ship this patch, what changes?" },
  { name: "replay-empty", url: "/replay", h1: "Replay", text: "No replay selected." },
  { name: "replay-malformed", url: "/replay?t=%25%25not-a-token!!", h1: "Replay", text: "This replay link is not valid." },
  { name: "replay-bad-json", url: `/replay?t=${Buffer.from("{nope").toString("base64url")}`, h1: "Replay", text: "This replay link is not valid." },
  { name: "replay-key-only", url: "/replay?key=p0537%3A1", h1: /round 1 · loss/, game: true },
];

for (const r of ROUTES) {
  test(`route ${r.name} loads clean`, async ({ page }) => {
    const w = watch(page);
    const res = await page.goto(r.url);
    expect(res.status(), "HTTP status").toBe(200);
    await expect(page.locator("h1")).toHaveText(r.h1);
    if (r.text) await expect(page.locator(".notice").first()).toContainText(r.text);
    if (r.game) await expect(page.frameLocator("iframe.game-frame").locator("#badge")).toContainText("seed 634310", { timeout: 45_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, `route-${r.name}`);
    expect(w.problems(), "console errors / failed requests").toEqual([]);
  });
}

test("replay with a full token (from a finding seed link) loads clean", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator("#findings a.chip[href^='/replay']").first().getAttribute("href");
  expect(href).toContain("t=");
  const w = watch(page);
  expect((await page.goto(href)).status()).toBe(200);
  await expect(page.locator("#replay-title")).toBeVisible();
  await expect(page.frameLocator("iframe.game-frame").locator("#badge")).toContainText("deterministic re-simulation", { timeout: 45_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "route-replay-token");
  expect(w.problems()).toEqual([]);
});

test("game page alone with a malformed token shows its own error", async ({ page }) => {
  const w = watch(page);
  await page.goto("/game/replay.html?t=garbage");
  await expect(page.locator("#err")).toHaveText("This replay link is missing or malformed.");
  // The page throws 'bad token' on purpose to stop the module; record it rather than fail on it.
  expect(w.pageErrors).toEqual(["bad token"]);
});

test("a malformed token next to a valid key silently replays the key", async ({ page }) => {
  await page.goto("/replay?key=p0537%3A1&t=garbage");
  await expect(page.locator("h1")).toContainText("round 1");
  await expect(page.getByText("This replay link is not valid.")).toHaveCount(0);
});

test("unknown route returns 404 page", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res.status()).toBe(404);
});
