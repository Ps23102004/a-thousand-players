// Shared helpers: console/network watcher, replay-token lookup, contrast and tap-target probes.
const path = require("node:path");

const SHOTS = path.join(__dirname, "screenshots");
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true, ...opts });

/** Collects console errors, uncaught page errors, failed requests and HTTP >= 400 responses, including from iframes. */
function watch(page) {
  const out = { console: [], pageErrors: [], failed: [], bad: [] };
  page.on("console", (m) => { if (m.type() === "error") out.console.push(`${m.text()} @ ${m.location().url || "?"}`); });
  page.on("pageerror", (e) => out.pageErrors.push(e.message));
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    // A navigation away (or a test ending) aborts in-flight requests; that is not a server failure.
    if (!/ERR_ABORTED/.test(err)) out.failed.push(`${r.method()} ${r.url()} ${err}`);
  });
  page.on("response", (r) => { if (r.status() >= 400) out.bad.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  out.problems = () => [...out.console, ...out.pageErrors, ...out.failed, ...out.bad];
  return out;
}

/** The replay token the server builds for a recorded round, read from the embedded game's iframe src. */
async function tokenFor(page, key) {
  await page.goto(`/replay?key=${encodeURIComponent(key)}`);
  const src = await page.locator("iframe.game-frame").getAttribute("src");
  return new URL(src, "http://x").searchParams.get("t");
}

/** WCAG contrast of every visible element with its own text, against the first opaque ancestor background. */
function contrastProbe() {
  const c = document.createElement("canvas"); c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const alphaOf = (css) => rgba(css)[3];
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (alphaOf(s.backgroundColor) >= 0.9) return rgba(s.backgroundColor); } return rgba(getComputedStyle(document.body).backgroundColor); };
  const fails = []; let checked = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!r.width || !r.height || s.visibility === "hidden" || +s.opacity === 0 || el.closest(".sr-only,[aria-hidden=true]")) continue;
    const fg = rgba(s.color), bg = bgOf(el), a = alphaOf(s.color);
    const mix = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
    const [L1, L2] = [lum(mix), lum(bg)].sort((x, y) => y - x);
    const ratio = (L1 + 0.05) / (L2 + 0.05);
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
    checked++;
    if (ratio < (large ? 3 : 4.5)) fails.push({ text: el.textContent.trim().slice(0, 50), tag: el.tagName.toLowerCase(), cls: el.className?.toString?.() ?? "", ratio: +ratio.toFixed(2), color: s.color, size });
  }
  return { checked, fails };
}

/** Controls under 24x24 CSS px (WCAG 2.5.8). `crowded` fails the spacing exception: another control sits inside the
 *  24 px box centred on it. `spaced` are undersized but pass by spacing. Inline links in running text are exempt. */
function tapProbe() {
  const els = [...document.querySelectorAll("a, button, summary, textarea, input, select")].filter((el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width && s.visibility !== "hidden" && !el.classList.contains("skip") && !(el.tagName === "A" && s.display === "inline" && el.closest("p, li:not(.chip), dd, span"));
  });
  const crowded = [], spaced = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width >= 24 && r.height >= 24) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const box = { l: Math.min(r.left, cx - 12), r: Math.max(r.right, cx + 12), t: Math.min(r.top, cy - 12), b: Math.max(r.bottom, cy + 12) };
    const hit = els.some((o) => { if (o === el || o.contains(el) || el.contains(o)) return false; const q = o.getBoundingClientRect(); return q.left < box.r && q.right > box.l && q.top < box.b && q.bottom > box.t; });
    (hit ? crowded : spaced).push({ text: (el.textContent || el.getAttribute("aria-label") || el.type || "").trim().slice(0, 40), tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return { crowded, spaced };
}

module.exports = { watch, tokenFor, shot, contrastProbe, tapProbe, REAL: process.env.E2E_REAL === "1" };

/** Report only browser observations. null is explicitly untested, never a guessed verdict. */
function controlReport(catalog, observations) {
  const known = new Set(catalog.map(row => row.control));
  const seen = new Map();
  for (const row of observations) {
    if (!known.has(row.control)) throw new Error(`Unknown control: ${row.control}`);
    if (seen.has(row.control)) throw new Error(`Duplicate control: ${row.control}`);
    seen.set(row.control, row);
  }
  return catalog.map(({ control, input, expected }) => {
    const row = seen.get(control);
    return { control, input, expected, observed: row?.observed ?? 'Not run in a browser', works: row?.works ?? null };
  });
}

/** Mutable plain object returned by the injected navigator.getGamepads, including analog-only triggers. */
function fakePadFrame({ buttons = [], analog = {}, axes = [] } = {}) {
  return {
    index: 2, id: 'DualSense (crawler fixture)', mapping: 'standard', connected: true,
    axes: Array.from({ length: 4 }, (_, i) => axes[i] ?? 0),
    buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : analog[i] ?? 0 })),
  };
}

/** Wait for real render frames, also when the simulation is paused (no fixed sleeps). */
async function renderFrames(page, count = 3) {
  await page.evaluate(count => new Promise(resolve => {
    const next = () => --count <= 0 ? resolve() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }), count);
}

module.exports.controlReport = controlReport;
module.exports.fakePadFrame = fakePadFrame;
module.exports.renderFrames = renderFrames;
