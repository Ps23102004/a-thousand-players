// npx tsx --env-file=.env ai/cli/triage.ts --dir data/run-main [--only bug2] [--regress 200]
// For every bug cluster in bugs.json (engine/bugs.mjs): Ultra proposes root cause + patch, then engine/verify-fix.mjs
// applies it to a scratch copy of the game, replays the exact seeds and runs a regression crowd. Writes triage.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import type { UsageRow } from "../../lib/types";
import { triageBug, type BugCluster } from "../triage";
import { getUsage } from "../usage";

const { values } = parseArgs({ options: { dir: { type: "string", default: "data/run-main" }, only: { type: "string" }, regress: { type: "string", default: "200" } } });
const dir = values.dir!;
const bugs: BugCluster[] = JSON.parse(readFileSync(`${dir}/bugs.json`, "utf8")).filter((b: BugCluster) => !values.only || b.id === values.only);
mkdirSync(`${dir}/fixes`, { recursive: true });

const out: unknown[] = [];
for (const bug of bugs) { // sequential: each verification runs a crowd on every core
  const t0 = Date.now();
  try {
    // Propose -> apply -> replay the exact seeds; a rejected hypothesis goes back to Ultra once with the replay result.
    let triage = await triageBug(bug), verify = null, history = "", attempts = 1;
    while (triage.patches.length) {
      writeFileSync(`${dir}/fixes/${bug.id}.json`, JSON.stringify({ patches: triage.patches }, null, 1));
      verify = JSON.parse(execFileSync(process.execPath, ["engine/verify-fix.mjs", "--bug", bug.id, "--dir", dir, "--regress", values.regress!], { encoding: "utf8", maxBuffer: 1e7 }));
      if (verify.verdict === "fixed" || attempts >= 2) break;
      const after = (JSON.parse(readFileSync(`${dir}/fixes/${bug.id}.verify.json`, "utf8")).after as { bugs: string[] }[]).map((a) => a.bugs.join("+") || "clean");
      history += `Attempt ${attempts}: "${triage.title}" patch ${JSON.stringify(triage.patches)} -> ${verify.verdict}; bug events per replayed round after the patch: ${after.join(", ")}\n`;
      triage = await triageBug(bug, "game/src", history); attempts++;
    }
    out.push({ ...bug, triage, verify, attempts, history: history || undefined });
    console.error(`[triage] ${bug.id} "${triage.title}" -> ${verify?.verdict ?? (triage.isRealBug ? "no patch" : "not a bug")} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    out.push({ ...bug, error: String((e as Error).message).slice(0, 300) });
    console.error(`[triage] ${bug.id} failed: ${(e as Error).message}`);
  }
}
const prev = existsSync(`${dir}/triage.json`) && values.only ? (JSON.parse(readFileSync(`${dir}/triage.json`, "utf8")) as { id: string }[]) : [];
const merged = [...prev.filter((p) => !out.some((o) => (o as { id: string }).id === p.id)), ...out].sort((a, b) => ((a as { id: string }).id < (b as { id: string }).id ? -1 : 1));
writeFileSync(`${dir}/triage.json`, JSON.stringify(merged, null, 1));

// Fold this run's model usage into usage.json so the UI's cost panel stays complete.
const usagePath = `${dir}/usage.json`;
const file = existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, "utf8")) : { usage: [], notes: [] };
for (const row of getUsage() as UsageRow[]) {
  const have = (file.usage as UsageRow[]).find((u) => u.model === row.model);
  if (have) { have.calls += row.calls; have.tokensIn += row.tokensIn; have.tokensOut += row.tokensOut; have.usdEstimate = +(have.usdEstimate + row.usdEstimate).toFixed(4); }
  else file.usage.push(row);
}
writeFileSync(usagePath, JSON.stringify(file, null, 1));
console.error(`[triage] wrote ${out.length} triaged bugs to ${dir}/triage.json; usage ${JSON.stringify(getUsage())}`);
