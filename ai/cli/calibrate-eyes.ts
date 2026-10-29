// npx tsx --env-file=.env ai/cli/calibrate-eyes.ts --out <file.json> [--base http://localhost:3140] [--rounds p0537:1,...] [--frames-only]
// Hit and false-alarm rates of Eyes (Nemotron Super-VL): for each round, the app's replay page renders the seed and returns the same
// 3 frames the Eyes panel would capture (lib/eyes.ts captureTimes), shrunk to 640 px JPEG like EyesPanel does; then ONE Super-VL call
// with the default question. Rounds with an invariant violation are "bug" rounds, the rest "clean". Answers are graded by hand in
// docs/calibration.md; the keyword flag here is only a first pass. Needs a running app and Playwright's global install
// (PLAYWRIGHT_DIR, default ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { describeFrames } from "../vision";
import { getUsage } from "../usage";
import { captureTimes, DEFAULT_QUESTION } from "../../lib/eyes";
import type { RunLine } from "../../lib/types";

const { values } = parseArgs({ options: {
  out: { type: "string" }, base: { type: "string", default: "http://localhost:3140" },
  rounds: { type: "string", default: "p0537:1,p0653:2,p0009:3,p0001:1,p0002:2,p0100:1" }, "frames-only": { type: "boolean", default: false },
} });
if (!values.out) throw new Error("--out is required");
const BUG = new Set(["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"]);
const runs = new Map(readFileSync("data/run-main/runs.jsonl", "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((o) => !("quit" in o)).map((r: RunLine) => [`${r.p}:${r.round}`, r]));

const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT_DIR ?? join(homedir(), ".local/lib/node_modules/@playwright/cli/node_modules/playwright"));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" }); // system Chrome, as e2e/README.md
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const framesDir = join(dirname(values.out), "eyes-frames");
mkdirSync(framesDir, { recursive: true });

const out: unknown[] = [];
for (const key of values.rounds!.split(",")) {
  const run = runs.get(key);
  if (!run) { console.error(`[eyes] ${key}: no such round`); continue; }
  const bug = run.ev.filter((e) => BUG.has(e[1])).map((e) => `${e[1]}@${e[0]}`);
  const times = captureTimes(run, Math.ceil(run.t));
  await page.goto(`${values.base}/replay?key=${encodeURIComponent(key)}`);
  await page.frameLocator("iframe.game-frame").locator("#badge").waitFor({ state: "visible", timeout: 60_000 });
  // Same capture + shrink as components/EyesPanel.tsx, run in the page. A string, not a function: tsx would inject its __name helper.
  const frames: string[] = await page.evaluate(`(async (times) => {
    const frame = document.querySelector("iframe.game-frame");
    const raw = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no frames")), 60000);
      const onMsg = (ev) => {
        if (ev.data?.type !== "frames") return;
        clearTimeout(timer); window.removeEventListener("message", onMsg); resolve(ev.data.frames);
      };
      window.addEventListener("message", onMsg);
      frame.contentWindow.postMessage({ type: "capture", times }, window.location.origin);
    });
    return Promise.all(raw.map(async (png) => {
      const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
      const c = document.createElement("canvas"); c.width = 640; c.height = Math.round((img.height / img.width) * 640);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.72).split(",")[1];
    }));
  })(${JSON.stringify(times)})`);
  frames.forEach((f, i) => writeFileSync(join(framesDir, `${key.replace(":", "-r")}-${i + 1}.jpg`), Buffer.from(f, "base64")));
  const row: Record<string, unknown> = { key, seed: run.seed, truth: bug.length ? "bug" : "clean", bugEvents: bug, times };
  if (!values["frames-only"]) {
    const text = await describeFrames(frames, DEFAULT_QUESTION);
    // First-pass flag only: does the answer claim something is wrong? Hand grading in docs/calibration.md is the result.
    const negated = /\b(nothing|no)\b[^.]{0,40}\b(wrong|unusual|abnormal|issue|problem)/i.test(text) || /looks? (normal|correct|fine)/i.test(text);
    row.text = text;
    row.flagged = /float|clip|sunk|frozen|outside|stuck|wrong|unnatural|impossib|through/i.test(text) && !negated;
  }
  out.push(row);
  console.error(`[eyes] ${key} ${row.truth} ${times.join(",")} ${row.flagged ?? ""}`);
  writeFileSync(values.out, JSON.stringify({ usage: getUsage(), results: out }, null, 1));
}
await browser.close();
console.error(`[eyes] done; usage ${JSON.stringify(getUsage())}`);
