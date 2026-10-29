// Offline dry-run and fake answers require no model credentials. See docs/glitch-hunt.md.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { captureTimes } from "../../lib/eyes";
import type { Persona, RunLine } from "../../lib/types";
import { selectGlitchBatch, scoreGlitchBatch, type ScoredRound, type Rate } from "../glitch";

const PROMPT = "Do these frames visibly show a physically impossible fighter position or motion, such as floating, clipping into scenery, being outside the arena, or being frozen? Answer YES or NO first, then briefly explain only what is visible.";
const MODEL = "nvidia/Nemotron-3.5-Super-VL";
const { values } = parseArgs({ options: {
  "dry-run": { type: "boolean", default: false }, "results-from": { type: "string" },
  base: { type: "string", default: "http://localhost:3143" }, seed: { type: "string", default: "1" },
} });
const seed = Number(values.seed);
if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("--seed must be a nonnegative integer");
if (values["dry-run"] && values["results-from"]) throw new Error("Choose --dry-run or --results-from");
const runs: RunLine[] = readFileSync("data/run-main/runs.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !('quit' in r));
const personas: Persona[] = JSON.parse(readFileSync("data/run-main/personas.json", "utf8"));
const batch = selectGlitchBatch(runs, personas, { seed, perTruth: 10 });
const byKey = new Map(runs.map(r => [`${r.p}:${r.round}`, r]));
const selected = [...batch.flagged, ...batch.clean];
const fake: Record<string, string> | undefined = values["results-from"] ? JSON.parse(readFileSync(values["results-from"], "utf8")) : undefined;
if (fake && selected.some(r => typeof fake[r.key] !== "string")) throw new Error("--results-from must contain an answer string for every selected key");
const plan = selected.map(r => ({ ...r, times: captureTimes(byKey.get(r.key), Math.ceil(r.duration)) }));
for (const row of plan) console.log(`${row.truth} ${row.key} seed=${row.seed} types=${row.types.join(",") || "none"} matchedTo=${row.matchedTo ?? "-"} times=${row.times.join(",")}`);
if (batch.flagged.length !== 10 || batch.clean.length !== 10 || !batch.flagged.some(r => r.key === "p0537:1")) throw new Error(`Recorded base run supplies ${batch.flagged.length} flagged rounds; the required batch needs 10`);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR ?? join(homedir(), ".local/lib/node_modules/@playwright/cli/node_modules/playwright"));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const scratch = mkdtempSync(join(tmpdir(), "glitch-hunt-"));
const results: (ScoredRound & { times: number[] })[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const row of plan) {
    await page.goto(`${values.base}/replay?key=${encodeURIComponent(row.key)}`);
    await page.frameLocator("iframe.game-frame").locator("#badge").waitFor({ state: "visible", timeout: 60_000 });
    const frames: string[] = await page.evaluate(`(async (times) => {
      const frame = document.querySelector('iframe.game-frame');
      const raw = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { window.removeEventListener('message', onMsg); reject(new Error('no frames')); }, 60000);
        const onMsg = ev => { if (ev.origin !== window.location.origin || ev.source !== frame.contentWindow || ev.data?.type !== 'frames') return; clearTimeout(timer); window.removeEventListener('message', onMsg); resolve(ev.data.frames); };
        window.addEventListener('message', onMsg); frame.contentWindow.postMessage({type:'capture', times}, window.location.origin);
      });
      return Promise.all(raw.map(async png => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode(); const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(img.height / img.width * 640); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .72).split(',')[1]; }));
    })(${JSON.stringify(row.times)})`);
    if (frames.length !== 3) throw new Error(`Expected three frames for ${row.key}`);
    frames.forEach((frame, i) => writeFileSync(join(scratch, `${row.key.replace(':', '-')}-${i + 1}.jpg`), Buffer.from(frame, "base64")));
    let answer = "";
    if (fake) answer = fake[row.key];
    else if (!values["dry-run"]) {
      const { chat } = await import("../models");
      answer = (await chat({ model: MODEL, system: "You look at frames from a 3D street fighting game replay. Describe only what is visible; say when you cannot tell.", user: PROMPT, images: frames, maxTokens: 300, temperature: 0.2, thinking: false, retries: 0 })).content;
    }
    results.push({ ...row, answer });
    console.log(`captured ${row.key}`);
  }
} finally { await browser.close(); }
console.log(`Frames: ${scratch}`);
if (!values["dry-run"]) {
  const score = scoreGlitchBatch(results);
  const output = { placeholder: false, seed, model: MODEL, prompt: PROMPT, source: fake ? "fake" : "model", results, score };
  mkdirSync("data/glitch-hunt", { recursive: true });
  writeFileSync("data/glitch-hunt/results.json", JSON.stringify(output, null, 2) + "\n");
  const fmt = (r: Rate) => r.total ? `${r.yes}/${r.total} (${(100*r.rate).toFixed(1)}%; ${(100*r.interval[0]).toFixed(1)}–${(100*r.interval[1]).toFixed(1)}%; ${r.unparseable} unparseable)` : "no observations";
  const table = Object.entries(score.byType).map(([type, rates]) => `| ${type} | ${fmt(rates.hit)} | ${fmt(rates.falseAlarm)} |`).join("\n");
  writeFileSync("docs/glitch-hunt.md", `# Glitch Hunter\n\n${fake ? "Fake answers; not a measured model result." : "Measured batch."}\n\nCommand: \`npx tsx ai/cli/glitch-hunt.ts --seed ${seed}\`${fake ? ` with fake answers from \`${values["results-from"]}\`` : ""}. Model: \`${MODEL}\`.\n\nPrompt: ${PROMPT}\n\nRates show counts, percentage, Wilson 95% interval, and unparseable answers. Unparseable answers count as misses. Controls are matched by archetype then closest duration; per-type false alarms use controls matched to rounds with that type, so categories can overlap.\n\n| Group | Hit rate | False-alarm rate |\n|---|---|---|\n| Overall | ${fmt(score.overall.hit)} | ${fmt(score.overall.falseAlarm)} |\n${table}\n\nSmall sample; camera distance can hide a glitch. Engine invariants are the detector and vision is a second opinion. Clean means no recorded invariant event, not proof of absence.\n`);
}
