// npx tsx --env-file=.env ai/cli/calibrate-oracle.ts --out <file.json> [--max-calls 20]
// How precise is Repro's oracle? Ten bug reports (clear, vague, wrong, off-topic) go through bugReportToOracle (Nemotron Super, up to
// 2 calls each). Each report also has a hand-written reference predicate: the rounds that truly show what it describes. The oracle's
// matches over every recorded round (main run + sweep-nerf run) are compared with the reference: precision, recall.
// Stops before a report that could push the Super call count past --max-calls.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { bugReportToOracle, RejectedInput } from "../nl";
import { getUsage } from "../usage";
import { matchOracle } from "../../lib/oracle";
import type { Ev, RunLine } from "../../lib/types";

const { values } = parseArgs({ options: { out: { type: "string" }, "max-calls": { type: "string", default: "20" } } });
if (!values.out) throw new Error("--out is required");

const count = (r: RunLine, f: (e: Ev) => boolean) => r.ev.filter(f).length;
const has = (r: RunLine, code: string, who?: 0 | 1) => r.ev.some((e) => e[1] === code && (who === undefined || e[2] === who));

// kind: clear = names the bug precisely; vague; wrong = describes something this game's data never shows; offtopic = not about the game.
const REPORTS: { id: string; kind: string; text: string; truth: (r: RunLine) => boolean }[] = [
  { id: "float-oob", kind: "clear", text: "My fighter got stuck floating in the air and then flew out of the arena past the wall.", truth: (r) => has(r, "airborne", 0) && has(r, "oob", 0) },
  { id: "knockdown-freeze", kind: "clear", text: "After a knockdown my character never got up; he lay on the ground frozen for the rest of the round.", truth: (r) => r.ev.some((e) => e[1] === "stuck" && String(e[3]).includes("KNOCKDOWN")) },
  { id: "sweep-spam", kind: "clear", text: "The CPU swept me three or more times in one round and I couldn't do anything about it.", truth: (r) => count(r, (e) => e[1] === "hit" && e[2] === 1 && e[3] === "SWEEP") >= 3 },
  { id: "stalemate", kind: "clear", text: "Nobody could land a hit for ages and the round just stalled until the timer ran out.", truth: (r) => has(r, "softlock") },
  { id: "crate-crash", kind: "clear", text: "The game crashed with an error when a crate was thrown.", truth: (r) => has(r, "crash") },
  { id: "vague-flying", kind: "vague", text: "something weird happened, the guy was kind of flying??", truth: (r) => has(r, "airborne") },
  { id: "vague-broken", kind: "vague", text: "the fight felt broken", truth: (r) => r.ev.some((e) => ["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"].includes(e[1])) },
  { id: "wrong-floor", kind: "wrong", text: "My fighter fell through the floor and dropped under the map.", truth: (r) => r.ev.some((e) => e[1] === "nan" || e[1] === "clip" || (e[1] === "oob" && Math.abs(Number(e[3])) < 10.4)) },
  { id: "wrong-onejab", kind: "wrong", text: "I was knocked out by a single jab in the first two seconds of the round.", truth: (r) => r.out === "loss" && r.ko !== null && r.ko.t <= 2 },
  { id: "offtopic", kind: "offtopic", text: "The checkout page on your store charged my credit card twice.", truth: () => false },
];

const read = (f: string) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((o) => !("quit" in o)) as RunLine[];
const runs = [...read("data/run-main/runs.jsonl"), ...read("data/run-main/runs-sweep-nerf.jsonl")];
const calls = () => getUsage().reduce((s, u) => s + u.calls, 0);

const out: unknown[] = [];
for (const rep of REPORTS) {
  if (calls() + 2 > Number(values["max-calls"])) { console.error(`[oracle] stopping before ${rep.id}: call cap`); break; }
  const truth = new Set(runs.filter(rep.truth).map((r) => `${r.p}:${r.round}:${r.seed}`));
  try {
    const oracle = await bugReportToOracle(rep.text);
    const matched = new Set(runs.filter((r) => matchOracle(oracle, r)).map((r) => `${r.p}:${r.round}:${r.seed}`));
    const tp = [...matched].filter((k) => truth.has(k)).length;
    const row = { id: rep.id, kind: rep.kind, oracle, truth: truth.size, matched: matched.size, tp,
      precision: matched.size ? tp / matched.size : null, recall: truth.size ? tp / truth.size : null };
    out.push(row);
    console.error(`[oracle] ${rep.id} truth ${truth.size} matched ${matched.size} tp ${tp} :: ${JSON.stringify(oracle.atoms)}`);
  } catch (e) {
    out.push({ id: rep.id, kind: rep.kind, truth: truth.size, rejected: e instanceof RejectedInput, error: (e as Error).message });
    console.error(`[oracle] ${rep.id} ${e instanceof RejectedInput ? "rejected" : "failed"}: ${(e as Error).message}`);
  }
  writeFileSync(values.out, JSON.stringify({ calls: calls(), usage: getUsage(), rounds: runs.length, results: out }, null, 1));
}
console.error(`[oracle] done: ${calls()} Super calls`);
