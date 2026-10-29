// Builds docs/proof/: for each bug cluster, three frames of the SAME seed replayed with the recorded game (fix flags off, the bug
// shows) and with the shipped game (fix flags on), side by side. Needs the app running (npm run dev -- -p 3150) and ImageMagick.
//   npx tsx scripts/proof-gallery.ts [--base http://localhost:3150]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { encodeToken, fighterFor } from "../lib/replay-token";
import { captureTimes } from "../lib/eyes";
import type { Persona } from "../lib/types";

const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3150";
const clusters = JSON.parse(readFileSync("data/run-main/bugs.json", "utf8")) as { id: string; signature: string; count: number; rounds: { p: string; round: number; seed: number; label: string; t: number; firstBug: [number, string, number] }[] }[];
const personas = new Map((JSON.parse(readFileSync("data/run-main/personas.json", "utf8")) as Persona[]).map((p) => [p.id, p]));
const recorded = JSON.parse(readFileSync("data/run-main/meta.json", "utf8")).recordedWith ?? {};
const patches: Record<string, object> = { "sweep-nerf": JSON.parse(readFileSync("data/patches/sweep-nerf.json", "utf8")) };
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR ?? join(homedir(), ".local/lib/node_modules/@playwright/cli/node_modules/playwright"));
mkdirSync("docs/proof", { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "proof-"));

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const summary: Record<string, unknown>[] = [];
async function frames(tuning: object, round: (typeof clusters)[0]["rounds"][0], times: number[]): Promise<string[] | null> {
  const token = encodeToken({ seed: round.seed, tuning: tuning as never, fighter: fighterFor(round.p), maxT: Math.ceil(round.t), persona: personas.get(round.p) });
  await page.goto(`${base}/replay?t=${token}`);
  try {
    await page.frameLocator("iframe.game-frame").locator("#badge").waitFor({ state: "visible", timeout: 30_000 });
    return (await page.evaluate(`(async (times) => {
      const frame = document.querySelector('iframe.game-frame');
      const raw = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { window.removeEventListener('message', onMsg); reject(new Error('no frames')); }, 60000);
        const onMsg = ev => { if (ev.origin !== window.location.origin || ev.source !== frame.contentWindow || ev.data?.type !== 'frames') return; clearTimeout(timer); window.removeEventListener('message', onMsg); resolve(ev.data.frames); };
        window.addEventListener('message', onMsg); frame.contentWindow.postMessage({type:'capture', times}, window.location.origin);
      });
      return Promise.all(raw.map(async png => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode(); const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(img.height / img.width * 640); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85).split(',')[1]; }));
    })(${JSON.stringify(times)})`)) as string[];
  } catch { return null; }
}
try {
  for (const c of clusters) {
    const r = c.rounds[0];
    const patch = patches[r.label] ?? {};
    const times = captureTimes({ ev: [r.firstBug as never], t: r.t }, Math.ceil(r.t));
    const before = await frames({ ...patch, ...recorded }, r, times);
    const after = await frames(patch, r, times);
    const rows: string[] = [];
    for (const [name, fr] of [["before", before], ["after", after]] as const) {
      if (!fr) { rows.push(""); continue; }
      const files = fr.map((b, i) => { const f = join(scratch, `${c.id}-${name}-${i}.jpg`); writeFileSync(f, Buffer.from(b, "base64")); return f; });
      const row = join(scratch, `${c.id}-${name}.jpg`);
      execFileSync("magick", [...files, "+append", "-font", "/System/Library/Fonts/SFNS.ttf", "-gravity", "NorthWest", "-fill", "white", "-undercolor", "#000000b0", "-pointsize", "26", "-annotate", "+8+8", name === "before" ? ` BEFORE: recorded game, ${c.signature.split(":")[0]} bug  (t = ${times.join(" s, ")} s)` : ` AFTER: shipped game, same seed ${r.seed}`, row]);
      rows.push(row);
    }
    const out = `docs/proof/${c.id}-before-after.jpg`;
    const present = rows.filter(Boolean);
    if (present.length) execFileSync("magick", [...present, "-append", "-quality", "82", out]);
    summary.push({ id: c.id, signature: c.signature, count: c.count, key: `${r.p}:${r.round}`, seed: r.seed, label: r.label, times, beforeFrames: !!before, afterFrames: !!after, image: present.length ? out : null });
    console.log(c.id, "before", !!before, "after", !!after);
  }
} finally { await browser.close(); }
writeFileSync("docs/proof/frames.json", JSON.stringify({ generated: "scripts/proof-gallery.ts", base, bugs: summary }, null, 1));
