// Nav, crowd grid, charts, findings, bugs and exploit pages show real data.
const { test, expect } = require("playwright/test");
const { watch, shot } = require("./helpers.cjs");

test("nav links go where they say", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const expected = [["Crowd", "/#crowd"], ["Findings", "/#findings"], ["Bugs", "/bugs"], ["Games", "/games"], ["Exploit", "/modes/exploit"], ["Repro", "/modes/repro"], ["Balance", "/modes/balance"], ["Advisor", "/modes/advisor"], ["Spec Drift", "/modes/drift"]];
  await expect(nav.getByRole("link")).toHaveText(expected.map((e) => e[0]));
  for (const [name, href] of expected.slice(2)) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator("h1")).toBeVisible();
  }
  await nav.getByRole("link", { name: "Findings" }).click();
  await expect(page).toHaveURL(/\/#findings$/);
  await expect(page.locator("#findings-title")).toBeInViewport();
  await page.getByRole("link", { name: "A Thousand Players" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("home counters and crowd grid render real data", async ({ page }) => {
  await page.goto("/");
  const counters = await page.locator(".counter").evaluateAll((els) => els.map((e) => [e.querySelector(".counter-label").textContent, e.querySelector(".counter-value").textContent]));
  test.info().annotations.push({ type: "counters", description: JSON.stringify(counters) });
  const players = Number(counters.find((c) => c[0] === "players")[1].replace(/,/g, ""));
  const rounds = Number(counters.find((c) => c[0] === "rounds played")[1].replace(/,/g, ""));
  expect(players).toBeGreaterThan(0);
  expect(rounds).toBeGreaterThan(players);
  await expect(page.locator(".sample-banner")).toHaveCount(0); // real run, not fixtures

  const canvas = page.locator(".crowd canvas[role=img]");
  await expect(canvas).toHaveAttribute("aria-label", /Grid of \d+ recorded rounds/);
  await page.waitForTimeout(1500);
  // Distinct colours on the canvas: a blank or single-colour canvas means nothing drew.
  const colours = await canvas.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return seen.size;
  });
  expect(colours).toBeGreaterThan(5);
  const items = page.locator(".tile-list li a");
  expect(await items.count()).toBeGreaterThan(10);
  await expect(items.first()).toHaveAttribute("href", /^\/replay\?key=p\d+%3A\d+&t=/);
  await page.locator("#crowd").screenshot({ path: `${__dirname}/screenshots/crowd-grid.png` });
});

test("crowd tile click opens that round's replay", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator(".crowd canvas[role=img]");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } }); // centre: the sticky header covers the top edge
  await expect(page).toHaveURL(/\/replay\?key=/, { timeout: 20_000 });
  expect(box.width).toBeGreaterThan(100);
});

test("four charts render with data and text equivalents", async ({ page }) => {
  await page.goto("/");
  const charts = page.locator(".panel.chart");
  await expect(charts).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const svg = charts.nth(i).locator("svg[role=img]");
    await expect(svg).toHaveAttribute("aria-label", /\d/);
    expect(await svg.locator("rect, path, circle, line").count(), `chart ${i} marks`).toBeGreaterThan(4);
  }
  const heat = await charts.nth(0).locator("svg").getAttribute("aria-label");
  expect(heat).toMatch(/Heatmap of [1-9]\d* knockouts/);
  await page.locator(".grid-2").first().screenshot({ path: `${__dirname}/screenshots/charts.png` });
});

test("finding cards show code-verified claims and replayable seeds", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("#findings article.finding");
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  const ok = page.locator("#findings li.chip-ok");
  expect(await ok.count()).toBeGreaterThan(0);
  await expect(ok.first()).toContainText("verified by code");
  await expect(ok.first()).toHaveAttribute("title", /Recomputed from the runs/);
  const stats = await page.locator("#findings").evaluate((s) => ({
    ok: s.querySelectorAll("li.chip-ok").length, warn: s.querySelectorAll("li.chip-warn").length,
    seedLinks: s.querySelectorAll("a.chip[href^='/replay']").length, deadSeeds: s.querySelectorAll("span.chip-warn").length,
  }));
  test.info().annotations.push({ type: "findings", description: JSON.stringify({ cards: n, ...stats }) });
  expect(stats.seedLinks).toBeGreaterThan(0);
  await expect(page.locator("#findings .lede.mono")).toContainText(/tokens of logs in one call/);
  await page.locator("#findings").screenshot({ path: `${__dirname}/screenshots/findings.png` });
});

test("/bugs shows four clusters each with a verdict", async ({ page }) => {
  const w = watch(page);
  await page.goto("/bugs");
  const cards = page.locator("article.finding");
  await expect(cards).toHaveCount(4);
  const summary = await cards.evaluateAll((els) => els.map((a) => ({
    title: a.querySelector("h2").textContent,
    chips: [...a.querySelectorAll(".finding-top > *")].map((c) => c.textContent),
    patches: a.querySelectorAll("pre.diff").length,
    regression: !!a.querySelector("table.regress"),
    replay: a.querySelector("a[href^='/replay']")?.getAttribute("href") ?? null,
  })));
  test.info().annotations.push({ type: "bugs", description: JSON.stringify(summary) });
  const VERDICTS = ["fix verified", "partly fixed", "not fixed", "patch did not apply", "triage failed", "not verified", "fixed by hand (Ultra failed)", "partly fixed by the bug2 hand fix (Ultra failed)", "bug did not reproduce, no verdict"];
  for (const b of summary) {
    expect(b.chips.some((c) => VERDICTS.some((v) => c === v || c.startsWith(v + " · "))), `verdict chip on "${b.title}"`).toBe(true);
    expect(b.replay).toMatch(/^\/replay\?key=/);
  }
  await expect(page.locator(".lede").first()).toContainText(/4 clusters of game-breaking states\. .*\d+ verified fixed/);
  await shot(page, "bugs");
  expect(w.problems()).toEqual([]);
});

test("exploit table has landed-hits column and working replay links", async ({ page }) => {
  await page.goto("/modes/exploit");
  const heads = await page.locator("thead th").allTextContents();
  expect(heads).toEqual(["Rank", "Strategy", "Win rate", "Avg hp lost", "Landed hits (measured)", "Replay"]);
  const rows = page.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  const hits = await rows.locator("td:nth-child(5)").allTextContents();
  test.info().annotations.push({ type: "hits", description: JSON.stringify(hits) });
  for (const h of hits) expect(h).toMatch(/^[A-Z_]+ ×\d+(, [A-Z_]+ ×\d+)*$/);
  const links = await rows.locator("a.chip").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const l of links) expect(l).toMatch(/^\/replay\?t=[A-Za-z0-9_-]+$/);
  await shot(page, "exploit");

  const w = watch(page);
  await rows.first().locator("a.chip").click();
  await expect(page).toHaveURL(/\/replay\?t=/);
  await expect(page.locator("#replay-title")).toBeVisible();
  await expect(page.frameLocator("iframe.game-frame").locator("#badge")).toContainText("deterministic re-simulation", { timeout: 45_000 });
  const badge = await page.frameLocator("iframe.game-frame").locator("#badge").textContent();
  test.info().annotations.push({ type: "exploit-badge", description: badge });
  expect(w.problems()).toEqual([]);
});
