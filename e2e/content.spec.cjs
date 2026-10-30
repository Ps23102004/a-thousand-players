// Nav, crowd grid, charts, findings, bugs and exploit pages show real data.
const { test, expect } = require("playwright/test");
const { watch, shot } = require("./helpers.cjs");

test("nav links go where they say", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const expected = [["Crowd", "/#crowd"], ["Findings", "/#findings"], ["Bugs", "/bugs"], ["Games", "/games"], ["Exploit", "/modes/exploit"], ["Repro", "/modes/repro"], ["Balance", "/modes/balance"], ["Advisor", "/modes/advisor"], ["Spec Drift", "/modes/drift"], ["Onboarding", "/modes/onboarding"]];
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
  await expect(page.locator("#findings .lede.mono")).toContainText(/prompt tokens\) in one call/);
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
  await expect(page.locator(".lede").first()).toContainText(/4 clusters of game-breaking states\. .*All 4 clusters replay clean/);
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

test("audit 2026-10-30: hero claims only what is measured, offers next steps, and the footer says where typed text goes", async ({ page }) => {
  await page.goto("/");
  const lede = page.locator(".lede").first();
  await expect(lede).not.toContainText("every log");
  await expect(lede).toContainText("summary");
  await expect(page.getByRole("link", { name: "See the 4 bugs and their proof" })).toHaveAttribute("href", "/bugs");
  await expect(page.getByRole("link", { name: "Try a live model call" })).toHaveAttribute("href", "/modes/repro");
  await expect(page.locator(".site-footer")).toContainText("Nebius Token Factory");
  await expect(page.locator("#findings")).not.toContainText("Trump");
  await page.goto("/modes/repro");
  await expect(page.locator("body")).not.toContainText("20-40 s");
});

test("audit round 2: /bugs says which fixes are Ultra's and which were made by hand; footer links to the repo", async ({ page }) => {
  await page.goto("/bugs");
  const lede = page.locator("p.lede").first();
  await expect(lede).toContainText("All 4 clusters replay clean in the shipped game");
  await expect(lede).toContainText("2 from Ultra's patch");
  await expect(lede).toContainText("2 by hand after Ultra's patch failed");
  await expect(page.locator(".site-footer").getByRole("link", { name: "Source code on GitHub" })).toHaveAttribute("href", "https://github.com/Ps23102004/a-thousand-players");
});

test("audit round 3: bug4 card says Ultra's patch is not shipped; regression rows say what they measure; home header says summary", async ({ page }) => {
  await page.goto("/bugs");
  const bug4 = page.locator("article").filter({ hasText: "stuck:KNOCKDOWN" }).first();
  await expect(bug4).toContainText("Ultra's patch fixed this seed but is not shipped");
  await expect(bug4).toContainText("rules.knockdownOnPropFix");
  await expect(page.locator("table.regress").first().getByRole("rowheader", { name: /before the (fix|patch)/ })).toBeVisible();
  await expect(page.locator("table.regress").first().getByRole("rowheader", { name: /with the (fix|patch)/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("row shipped");
  await page.goto("/");
  await expect(page.locator("#findings-title").locator("xpath=..")).toContainText("a summary of 2,831 rounds");
  await expect(page.locator("#findings-title").locator("xpath=..")).not.toContainText("prompt tokens of logs");
});

test("audit round 3: every PROOF replay link (before and after, all four bugs) has a badge that matches its tuning", async ({ page }) => {
  const proof = require("node:fs").readFileSync(require("node:path").join(__dirname, "../docs/PROOF.md"), "utf8");
  const links = [...proof.matchAll(/\[(before|after)[^\]]*\]\(https:\/\/[^)]+\/replay\?t=([A-Za-z0-9_-]+)\)/g)];
  expect(links.length).toBe(8);
  for (const [, which, token] of links) {
    const tuning = JSON.parse(Buffer.from(token, "base64url").toString()).tuning ?? {};
    const keys = Object.keys(tuning);
    const expected = keys.length === 0 ? "shipped tuning" : keys.every((k) => k.startsWith("rules.") && tuning[k] === 0) ? "build as recorded" : "patched tuning";
    await page.goto(`/replay?t=${token}`);
    await expect(page.frameLocator("iframe.game-frame").locator("#badge")).toContainText(expected, { timeout: 45_000 });
    if (which === "after" && keys.length === 0) await expect(page.frameLocator("iframe.game-frame").locator("#badge")).not.toContainText("recorded");
  }
});
