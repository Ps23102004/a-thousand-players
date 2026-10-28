// Screen footage for docs/video-script.md: one 1920x1080 clip per scene, saved as footage/<nn>-<scene>.mp4.
//
//   npm run dev -- -p 3170
//   NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node e2e/footage.cjs [scene ...]
//
// With no scene names it records every Recorded-run scene. The live scenes (repro, eyes) make real model calls
// (repro: 1 Super + 1 Ultra + 1 Tavily; eyes: 1 Super-VL) and run only when named. Needs ffmpeg on PATH.
// Each run merges its clips' durations and timestamp marks into footage/clips.json for the manifest.
const { chromium } = require("playwright");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.FOOTAGE_BASE_URL || "http://localhost:3170";
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "footage");
const RAW = path.join(OUT, ".raw");
const SIZE = { width: 1920, height: 1080 };
// Page zoom so the site's ~1160 px column fills a 1080p frame (recordVideo ignores deviceScaleFactor). FOOTAGE_ZOOM=1 for none.
const ZOOM = +(process.env.FOOTAGE_ZOOM || 1.5);
const REPLAY = "/replay?key=p0537%3A1"; // seed 634310, airborne bug at 13.8 s
const CROWD_CMD = ["engine/crowd.mjs", "--personas", "data/run-main/personas.json", "--out", ".work/tp", "--traces", "0"];

// Page zoom, a hidden Next dev indicator, and a visible cursor dot (headless video has none) that follows the mouse and
// shrinks on press. The CSS goes in an adopted sheet and the dot is added after load, so React hydration sees
// untouched server HTML. Top frame only.
const CURSOR = (zoom) => {
  if (window.top !== window) return;
  const css = new CSSStyleSheet();
  css.replaceSync(`html{zoom:${zoom}} nextjs-portal{display:none!important}`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, css];
  addEventListener("load", () => setTimeout(() => {
    const c = document.createElement("div");
    Object.assign(c.style, { position: "fixed", left: "-50px", top: "-50px", width: "22px", height: "22px", borderRadius: "50%", background: "rgba(255,255,255,.9)", border: "2px solid #111", boxShadow: "0 0 0 5px rgba(118,185,0,.35)", transform: "translate(-50%,-50%)", zIndex: 2147483647, pointerEvents: "none", transition: "width .12s, height .12s" });
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => { c.style.width = c.style.height = "14px"; }, true);
    addEventListener("mouseup", () => { c.style.width = c.style.height = "22px"; }, true);
  }, 300));
};

const wait = (page, ms) => page.waitForTimeout(ms);

/** Eased scroll so the element's top sits `offset` px below the sticky header. */
function scrollTo(loc, ms = 1800, offset = 110) {
  return loc.evaluate((el, [ms, offset]) => new Promise((done) => {
    document.documentElement.style.scrollBehavior = "auto";
    const from = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    const to = Math.max(0, Math.min(el.getBoundingClientRect().top + window.scrollY - offset, max)), t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      window.scrollTo(0, from + (to - from) * e);
      k < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), [ms, offset]);
}

/** Green outline around an element for `ms`, then removed. */
async function highlight(page, loc, ms = 1800) {
  await loc.evaluate((el, ms) => {
    el.style.outline = "3px solid #76b900"; el.style.outlineOffset = "5px";
    setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, ms);
  }, ms);
  await wait(page, ms);
}

async function glide(page, loc, steps = 35) {
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
}

async function click(page, loc) {
  await loc.scrollIntoViewIfNeeded();
  await glide(page, loc);
  await wait(page, 350);
  await loc.click();
}

const gameFrame = (page) => page.frames().find((f) => f.url().includes("/game/replay.html"));

/** Records the bug lines the in-game ticker shows (it keeps only the last 5). */
async function watchTicker(page) {
  const f = gameFrame(page);
  await f.evaluate(() => {
    window.__bugs = [];
    new MutationObserver(() => document.querySelectorAll("#ticker .bug").forEach((d) => { if (!window.__bugs.includes(d.textContent)) window.__bugs.push(d.textContent); }))
      .observe(document.getElementById("ticker"), { childList: true });
  });
  return f;
}

const SCENES = {
  async home(page, mark) {
    await page.goto("/");
    await page.locator(".counter").first().waitFor();
    await page.mouse.move(1000, 500);
    mark("hero visible");
    await wait(page, 2500);
    for (const c of await page.locator(".counter").all()) await highlight(page, c, 1600);
    mark("counters highlighted");
    await scrollTo(page.locator("#crowd"), 2200);
    mark("crowd grid in view");
    await wait(page, 4000);
    await glide(page, page.locator(".crowd canvas[role=img]"), 60);
    await wait(page, 4000);
    mark("end");
  },

  async findings(page, mark) {
    await page.goto("/#crowd");
    await page.locator("#findings").waitFor();
    await wait(page, 1500);
    await scrollTo(page.locator("#findings"), 2200);
    mark("findings header");
    await highlight(page, page.locator("#findings .lede.mono").first(), 2500);
    const card = page.locator("#findings article.finding").first();
    await scrollTo(card, 1500);
    mark("first finding");
    await highlight(page, card, 2500);
    for (const chip of (await card.locator("li.chip-ok").all()).slice(0, 4)) await highlight(page, chip, 1500);
    mark("verified claims highlighted");
    await wait(page, 2000);
    await scrollTo(page.locator("#findings article.finding").nth(2), 4000);
    await wait(page, 2500);
    mark("end");
  },

  async charts(page, mark) {
    await page.goto("/");
    await page.locator(".panel.chart").first().waitFor();
    await wait(page, 1000);
    const charts = page.locator(".panel.chart");
    for (let i = 0; i < (await charts.count()); i++) {
      await scrollTo(charts.nth(i), 1800, 140);
      mark(`chart ${i + 1}`);
      await highlight(page, charts.nth(i), 3500);
    }
    await wait(page, 1500);
    mark("end");
  },

  async replay(page, mark) {
    await page.goto(REPLAY);
    const badge = page.frameLocator("iframe.game-frame").locator("#badge");
    await badge.waitFor({ state: "visible", timeout: 60_000 });
    const header = await page.locator("header").first().evaluate((h) => h.getBoundingClientRect().height).catch(() => 60);
    await scrollTo(page.locator("iframe.game-frame"), 1200, header + 8);
    const f = await watchTicker(page);
    mark("badge visible, game playing");
    await f.locator("#badge").evaluate((el) => { el.style.outline = "3px solid #76b900"; el.style.outlineOffset = "4px"; setTimeout(() => { el.style.outline = ""; }, 4000); });
    await f.waitForFunction(() => window.__bugs.some((b) => b.includes("airborne")), null, { timeout: 120_000, polling: 100 });
    const line = await f.evaluate(() => window.__bugs.find((b) => b.includes("airborne")));
    mark(`ticker: ${line}`);
    await f.locator("#ticker").evaluate((el) => { el.style.outline = "3px solid #76b900"; el.style.outlineOffset = "4px"; });
    await wait(page, 6000);
    mark("end");
  },

  async bugs(page, mark) {
    await page.goto("/bugs");
    await page.locator("article.finding").first().waitFor();
    await page.mouse.move(1100, 400);
    mark("bugs page");
    await highlight(page, page.locator(".lede").first(), 3000);
    for (const card of await page.locator("article.finding").all()) {
      await scrollTo(card, 1800);
      const title = (await card.locator("h2").textContent()).trim();
      mark(`card: ${title.slice(0, 60)}`);
      await highlight(page, card.locator(".finding-top"), 2200);
      await wait(page, 1500);
    }
    mark("end");
  },

  async exploit(page, mark) {
    await page.goto("/modes/exploit");
    await page.locator("tbody tr").first().waitFor();
    await page.mouse.move(1100, 300);
    mark("exploit page");
    await wait(page, 2000);
    await scrollTo(page.locator("table").first(), 1800, 160);
    mark("table in view");
    await highlight(page, page.locator("thead th").nth(4), 2000);
    await page.locator("tbody td:nth-child(5)").evaluateAll((tds) => tds.forEach((td) => { td.style.outline = "2px solid #76b900"; td.style.outlineOffset = "-2px"; }));
    mark("landed-hits column highlighted");
    await wait(page, 4000);
    await highlight(page, page.locator("tbody tr").first(), 3000);
    mark("end");
  },

  async repro(page, mark, live) {
    await page.goto("/modes/repro");
    await page.mouse.move(1000, 250);
    mark("repro page");
    await wait(page, 2000);
    await click(page, page.getByRole("button", { name: "Use an example" }));
    mark("example filled");
    await highlight(page, page.getByLabel("Bug report", { exact: true }), 3000);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/repro"), { timeout: 170_000 }),
      click(page, page.getByRole("button", { name: "Find it in the crowd" })),
    ]);
    mark("repro response received");
    live.repro = { status: res.status(), body: await res.json().catch(() => null) };
    await page.getByRole("button", { name: "Asking the model..." }).waitFor({ state: "detached", timeout: 170_000 });
    mark(`repro HTTP ${res.status()}: ${live.repro.body?.matched ?? "?"} matched of ${live.repro.body?.total ?? "?"}`);
    if (res.status() !== 200) { await wait(page, 4000); return; }
    const oracle = page.getByRole("heading", { name: "Oracle (written by Nemotron Super)" });
    await scrollTo(oracle, 1800);
    await highlight(page, oracle.locator("xpath=.."), 4000);
    mark("oracle shown");
    const rows = page.locator("tbody tr");
    await scrollTo(page.locator("table").first(), 1800, 200);
    mark("matching rounds table");
    for (const r of await rows.all()) await highlight(page, r, 2200);
    // Triage both matches in one take (2 Ultra calls); the first is p0537 round 1 (seed 634310).
    live.triages = [];
    for (const [i, seed] of ["634310", "497239"].entries()) {
      const want = page.locator("tbody tr", { has: page.locator("a.chip", { hasText: `seed ${seed}` }) });
      if (!(await want.count())) { mark(`no match row for seed ${seed}`); continue; }
      const tag = i ? "second triage" : "triage";
      await scrollTo(want.first(), 1500, 200);
      mark(`${tag}: row seed ${seed}`);
      const [tres] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/triage"), { timeout: 120_000 }),
        click(page, want.first().getByRole("button", { name: /Triage (round|again)|Triage this/ })),
      ]);
      const body = await tres.json().catch(() => null);
      live.triages.push({ seed, status: tres.status(), body });
      const verdict = page.locator("td[aria-live] .finding .chips .chip").nth(0);
      await page.locator("td[aria-live] .finding .chips .chip, td[aria-live] .notice-error").first().waitFor({ timeout: 30_000 }).catch(() => {});
      mark(`${tag} HTTP ${tres.status()}: ${body?.verdict ?? body?.error ?? "?"}`);
      if (await verdict.count()) {
        const chip = page.locator("td[aria-live] .finding .chips .chip", { hasText: /fixed|credited|legitimate|did not apply/ }).first();
        await scrollTo(chip, 1500, 200);
        await highlight(page, chip, 4000);
        const rep = page.locator("td[aria-live] .label", { hasText: "Replay of seed" });
        if (await rep.count()) await scrollTo(rep, 2500, 300);
        mark(`${tag}: verdict visible`);
        await wait(page, 6000);
      } else await wait(page, 4000);
      mark(`${tag}: hold end`);
    }
    live.triage = live.triages[0];
    const prec = page.getByRole("button", { name: "Find precedent (Tavily)" });
    if (process.env.FOOTAGE_PRECEDENT === "1" && (await prec.count())) {
      const [pres] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/precedent"), { timeout: 60_000 }), click(page, prec.first())]);
      live.precedent = { status: pres.status(), body: await pres.json().catch(() => null) };
      await wait(page, 1500);
      mark(`precedent HTTP ${pres.status()}`);
      await wait(page, 4000);
    }
    mark("end");
  },

  async eyes(page, mark, live) {
    await page.goto(REPLAY);
    await page.frameLocator("iframe.game-frame").locator("#badge").waitFor({ state: "visible", timeout: 60_000 });
    mark("replay loaded");
    await wait(page, 3000);
    const panel = page.locator(".panel", { hasText: "Eyes:" });
    await scrollTo(panel, 2000);
    mark("eyes panel");
    await wait(page, 1500);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/eyes"), { timeout: 170_000 }),
      click(page, page.getByRole("button", { name: "Look at 3 frames" })),
    ]);
    live.eyes = { status: res.status(), body: await res.json().catch(() => null) };
    await page.getByRole("button", { name: "Capturing and asking..." }).waitFor({ state: "detached", timeout: 170_000 });
    mark(`eyes HTTP ${res.status()}`);
    await scrollTo(panel, 1500);
    await highlight(page, panel.locator("[aria-live]").first(), 5000);
    await wait(page, 4000);
    mark("end");
  },

  async models(page, mark) {
    await page.goto("/");
    await page.locator("#models-title").waitFor();
    await wait(page, 800);
    await scrollTo(page.locator("#models-title"), 2500);
    await page.mouse.move(1150, 650);
    mark("'Who did what' section");
    await wait(page, 7000);
    // The static slide from the script, rendered as a 1080p card.
    const md = fs.readFileSync(path.join(ROOT, "docs/video-script.md"), "utf8");
    const table = md.split("## Model table slide")[1].split("\n## ")[0].split("\n").filter((l) => l.startsWith("|") && !/^\|[-| ]+\|$/.test(l));
    const cells = table.map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    await page.setContent(`<!doctype html><html style="zoom:1"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0d0a;color:#e9ede4;font:28px/1.4 ui-sans-serif,system-ui,-apple-system">
      <div><div style="color:#76b900;font:600 22px ui-monospace,monospace;letter-spacing:.12em;margin-bottom:24px">WHO DID WHAT</div>
      <table style="border-collapse:collapse;min-width:1500px">${cells.map((r, i) => `<tr>${r.map((c) => i === 0 ? `<th style="text-align:left;padding:18px 28px;border-bottom:2px solid #76b900;color:#9aa394;font-weight:600">${esc(c)}</th>` : `<td style="padding:18px 28px;border-bottom:1px solid #2a2f27">${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div></body></html>`);
    mark("static model slide");
    await wait(page, 8000);
    mark("end");
  },
};

const ORDER = [["home", "0:00"], ["terminal", "0:12"], ["findings", "0:30"], ["charts", "0:52"], ["replay", "1:05"], ["bugs", "1:20"], ["exploit", "1:48"], ["repro", "2:10"], ["eyes", "2:28"], ["models", "2:42"]];
const LIVE = new Set(["repro", "eyes"]);

const probe = (file) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();

function encode(webm, mp4) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", mp4]);
  fs.rmSync(webm);
}

/** Runs the crowd command, keeping every stderr/stdout chunk with its time so the clip plays at the real speed. */
function runCrowd() {
  return new Promise((resolve, reject) => {
    const chunks = [], t0 = Date.now();
    const p = spawn(process.execPath, CROWD_CMD, { cwd: ROOT });
    for (const s of ["stdout", "stderr"]) p[s].on("data", (d) => chunks.push([Date.now() - t0, d.toString()]));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, ms: Date.now() - t0, chunks }));
  });
}

async function terminal(browser, mark, clock) {
  const run = await runCrowd();
  const cmd = `node ${CROWD_CMD.join(" ")}`;
  fs.writeFileSync(path.join(OUT, "terminal-crowd.log"), `$ ${cmd}\n${run.chunks.map((c) => c[1]).join("")}\n# exit ${run.code}, wall ${(run.ms / 1000).toFixed(1)} s\n`);
  fs.writeFileSync(path.join(OUT, "terminal-crowd.json"), JSON.stringify({ cmd, ...run }));
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: RAW, size: SIZE } });
  const page = await ctx.newPage();
  clock.t0 = Date.now();
  await page.setContent(`<!doctype html><html><body style="margin:0;height:100vh;background:#111;display:grid;place-items:center">
    <div style="width:1600px;height:860px;background:#1b1d1a;border-radius:14px;box-shadow:0 30px 80px #000;overflow:hidden;font:30px/1.5 ui-monospace,Menlo,monospace;color:#d6dbd0">
    <div style="height:44px;background:#2a2c28;display:flex;align-items:center;gap:10px;padding:0 18px"><i style="width:14px;height:14px;border-radius:50%;background:#ff5f57"></i><i style="width:14px;height:14px;border-radius:50%;background:#febc2e"></i><i style="width:14px;height:14px;border-radius:50%;background:#28c840"></i><span style="margin-left:16px;color:#8a8f86;font-size:18px">sparring — zsh</span></div>
    <pre id="t" style="margin:0;padding:28px 34px;white-space:pre-wrap;word-break:break-all"></pre></div></body></html>`);
  mark("terminal window");
  await page.evaluate(async ({ cmd, chunks }) => {
    const t = document.getElementById("t"), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let text = "";
    const show = (cursor = true) => { t.innerHTML = ""; const span = document.createElement("span"); span.textContent = text; t.append(span); if (cursor) t.insertAdjacentHTML("beforeend", '<span style="background:#d6dbd0">&nbsp;</span>'); };
    await sleep(1200);
    text = "~/Developer/sparring $ "; show();
    await sleep(800);
    for (const ch of cmd) { text += ch; show(); await sleep(28); }
    await sleep(700); text += "\n"; show();
    const start = performance.now();
    for (const [at, s] of chunks) {
      while (performance.now() - start < at) await sleep(10);
      for (const part of s.split(/(\r)/)) {
        if (part === "\r") text = text.slice(0, text.lastIndexOf("\n") + 1);
        else text += part;
      }
      show();
    }
    text += "~/Developer/sparring $ "; show();
  }, { cmd, chunks: run.chunks });
  mark("crowd run finished");
  await page.waitForTimeout(5000);
  mark("end");
  const video = page.video();
  await ctx.close();
  return { webm: await video.path(), extra: { crowdExit: run.code, crowdWallSeconds: +(run.ms / 1000).toFixed(1), lastLine: run.chunks.map((c) => c[1]).join("").trim().split("\n").pop() } };
}

(async () => {
  const want = process.argv.slice(2);
  const scenes = want.length ? ORDER.filter(([n]) => want.includes(n)) : ORDER.filter(([n]) => !LIVE.has(n));
  if (want.length && scenes.length !== want.length) throw new Error(`unknown scene in ${want.join(", ")}; known: ${ORDER.map((o) => o[0]).join(", ")}`);
  fs.mkdirSync(RAW, { recursive: true });
  const indexFile = path.join(OUT, "clips.json");
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : {};
  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? "chrome", args: ["--use-angle=metal", "--enable-gpu"] });

  // Warm every route and the game's shaders so first-hit compiles stay out of the clips.
  const warm = await browser.newPage({ viewport: SIZE });
  for (const u of ["/", "/bugs", "/modes/exploit", "/modes/repro"]) await warm.goto(BASE + u);
  await warm.goto(BASE + REPLAY);
  await warm.frameLocator("iframe.game-frame").locator("#badge").waitFor({ state: "visible", timeout: 90_000 });
  await warm.close();

  for (const [name, at] of scenes) {
    const marks = [], problems = [];
    const clock = { t0: Date.now() };
    let webm, extra = {}, live = {};
    const mark = (label) => { marks.push(`${((Date.now() - clock.t0) / 1000).toFixed(1)}s ${label}`); console.log(`  [${name}] ${marks.at(-1)}`); };
    console.log(`recording ${name}`);
    try {
      if (name === "terminal") ({ webm, extra } = await terminal(browser, mark, clock));
      else {
        const ctx = await browser.newContext({ viewport: SIZE, baseURL: BASE, recordVideo: { dir: RAW, size: SIZE } });
        await ctx.addInitScript(CURSOR, ZOOM);
        const page = await ctx.newPage();
        clock.t0 = Date.now();
        page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`); });
        page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
        page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
        try { await SCENES[name](page, mark, live); } catch (e) { problems.push(`script: ${e.message.split("\n")[0]}`); }
        const video = page.video();
        await ctx.close();
        webm = await video.path();
      }
    } catch (e) { problems.push(`script: ${e.message.split("\n")[0]}`); }
    if (!webm) { index[name] = { at, problems }; continue; }
    const n = String(ORDER.findIndex((o) => o[0] === name) + 1).padStart(2, "0");
    const file = `${n}-${name}.mp4`;
    encode(webm, path.join(OUT, file));
    if (Object.keys(live).length) fs.writeFileSync(path.join(OUT, `${n}-${name}.live.json`), JSON.stringify(live, null, 2));
    index[name] = { file, at, seconds: +probe(path.join(OUT, file)).toFixed(1), marks, problems: [...new Set(problems)], ...extra, recorded: new Date().toISOString() };
    console.log(`  -> ${file} ${index[name].seconds}s${problems.length ? ` problems: ${problems.length}` : ""}`);
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  }
  await browser.close();
  fs.rmSync(RAW, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
