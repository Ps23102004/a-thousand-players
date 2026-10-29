// npx tsx ai/cli/calibration-audit.ts [--triage-runs <calibrate-triage output.json>]
// Offline half of docs/calibration.md, no model calls: (1) Ultra's stated triage confidence vs the replay verdict for every recorded
// triage, (2) how loose ai/verify.ts's claim tolerance is (mutated claims, wrong-scope claims, header copies), (3) player-bootstrap
// intervals for the headline rates. Prints markdown tables.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { brier, calibrationTable, claimInterval, wilson, type Forecast } from "../../lib/calibration";
import { parseRunsJsonl } from "../../lib/stats";
import { ARCHETYPES, type Claim, type Finding, type Persona, type SessionEnd } from "../../lib/types";
import { claimOk, computeMetric } from "../verify";

const { values } = parseArgs({ options: { "triage-runs": { type: "string" } } });
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// ---------- 1. triage confidence ----------
interface Point { source: string; round: string; confidence: number; verdict: string }
const points: Point[] = [], invalid: string[] = [];
for (const b of json("data/run-main/triage.json")) if (b.triage) points.push({ source: "offline triage.json (final attempt)", round: b.id, confidence: b.triage.confidence, verdict: b.verify?.verdict ?? "no patch" });
for (const f of readdirSync("footage").filter((f) => f.endsWith(".live.json"))) {
  const j = json(`footage/${f}`);
  for (const t of [...(j.triages ?? []), ...(j.triage ? [j.triage] : [])]) {
    if (t.status === 200) points.push({ source: `footage/${f}`, round: `${t.body.p}:${t.body.round}`, confidence: t.body.triage.confidence, verdict: t.body.verdict });
    else invalid.push(`footage/${f} HTTP ${t.status}`);
  }
}
if (values["triage-runs"] && existsSync(values["triage-runs"])) {
  for (const r of json(values["triage-runs"]).results) {
    if (r.verdict) points.push({ source: "calibrate-triage", round: r.spec, confidence: r.confidence, verdict: r.verdict });
    else invalid.push(`calibrate-triage ${r.spec}: ${String(r.error).slice(0, 80)}`);
  }
}
const fc: Forecast[] = points.map((p) => ({ p: p.confidence, y: p.verdict === "fixed" ? 1 : 0 }));
const base = fc.reduce((s, f) => s + f.y, 0) / fc.length;
console.log(`## Triage confidence\n\n| source | round | stated confidence | replay verdict |\n| --- | --- | --- | --- |`);
for (const p of points) console.log(`| ${p.source} | ${p.round} | ${p.confidence} | ${p.verdict} |`);
console.log(`\nAnswers with no verdict (failed patch validation, confidence not returned): ${invalid.length}\n${invalid.map((s) => `- ${s}`).join("\n")}`);
console.log(`\n| stated confidence | n | mean stated | observed fixed rate | 95% Wilson interval |\n| --- | --- | --- | --- | --- |`);
for (const b of calibrationTable(fc)) {
  if (!b.n) continue;
  const k = Math.round(b.observed * b.n), [lo, hi] = wilson(k, b.n);
  console.log(`| ${b.lo}-${b.hi} | ${b.n} | ${b.meanP.toFixed(3)} | ${k}/${b.n} = ${pct(b.observed)} | ${pct(lo)}-${pct(hi)} |`);
}
const cs = fc.map((f) => f.p);
console.log(`\nn ${fc.length}, fixed ${fc.filter((f) => f.y).length}, confidence range ${Math.min(...cs)}-${Math.max(...cs)}, mean ${(cs.reduce((a, b) => a + b, 0) / cs.length).toFixed(3)}`);
console.log(`Brier ${brier(fc).toFixed(3)}; constant forecast at the observed base rate ${base.toFixed(3)} scores ${brier(fc.map((f) => ({ p: base, y: f.y }))).toFixed(3)}`);
const meanBy = (y: 0 | 1) => { const g = fc.filter((f) => f.y === y); return g.length ? (g.reduce((s, f) => s + f.p, 0) / g.length).toFixed(3) : "-"; };
console.log(`Mean stated confidence when fixed ${meanBy(1)}, when not fixed ${meanBy(0)}`);

// ---------- 2. claim tolerance ----------
const personas = json("data/run-main/personas.json") as Persona[];
const parsed = parseRunsJsonl(readFileSync("data/run-main/runs.jsonl", "utf8"));
const runs = parsed.runs, sessions = [...parsed.sessions, ...(json("data/run-main/sessions.json") as SessionEnd[])];
const FRACTION = new Set(["winRate", "quitRate", "koShare"]);
// Cells ai/corpus.ts header() prints, computed by code: overall (all metrics), by archetype (all), by round (win, quit, duration),
// archetype x round (win, quit). A claim on one of these scopes can be copied from the prompt instead of found in the per-player lines.
const isHeaderCell = (c: Claim) => {
  const { archetype, round } = c.scope;
  if (!archetype && round === undefined) return true;
  if (archetype && round === undefined) return true;
  if (!archetype) return ["winRate", "quitRate", "avgDuration"].includes(c.metric);
  return c.metric === "winRate" || c.metric === "quitRate";
};
const claimSets: [string, string][] = [["main run", "data/run-main/findings.json"], ["fixture 150", "data/fixtures-ai/findings.json"], ["fixture 1000", "data/fixtures-ai/big/findings.json"]];
console.log(`\n## Claims\n\n| findings | claims | header cells | independent aggregates | failed verification |\n| --- | --- | --- | --- | --- |`);
for (const [name, f] of claimSets) {
  if (!existsSync(f)) continue;
  const cl = (json(f).findings as Finding[]).flatMap((x) => (x.verified ?? x.claims.map((c) => ({ claim: c, ok: true }))).map((v) => ({ c: v.claim, ok: v.ok })));
  console.log(`| ${name} | ${cl.length} | ${cl.filter((x) => isHeaderCell(x.c)).length} | ${cl.filter((x) => !isHeaderCell(x.c)).length} | ${cl.filter((x) => !x.ok).length} |`);
}

const claims = (json("data/run-main/findings.json").findings as Finding[]).flatMap((f) => f.claims);
const actual = new Map(claims.map((c) => [c, computeMetric(c, personas, runs, sessions)!]));
const err = claims.map((c) => Math.abs(c.value - actual.get(c)!) / (FRACTION.has(c.metric) ? 1 : Math.max(Math.abs(actual.get(c)!), 1e-9)));
console.log(`\nLargest gap between a stated value and the recomputed one: fractions ${Math.max(...claims.map((c, i) => (FRACTION.has(c.metric) ? err[i] : 0))).toFixed(4)} absolute, others ${pct(Math.max(...claims.map((c, i) => (FRACTION.has(c.metric) ? 0 : err[i]))))} relative`);
console.log(`\n| shift applied to each stated value | rate claims still verified | other claims still verified |\n| --- | --- | --- |`);
for (const d of [0.01, 0.05, 0.1, 0.2]) {
  const res = (frac: boolean) => {
    const cs = claims.filter((c) => FRACTION.has(c.metric) === frac);
    const ok = cs.flatMap((c) => [1 + d, 1 - d].map((m) => claimOk({ ...c, value: c.value * m }, actual.get(c)!))).filter(Boolean).length;
    return `${ok}/${cs.length * 2} (${pct(ok / (cs.length * 2))})`;
  };
  console.log(`| ±${d * 100}% relative | ${res(true)} | ${res(false)} |`);
}
for (const d of [0.01, 0.03, 0.05]) {
  const cs = claims.filter((c) => FRACTION.has(c.metric));
  const ok = cs.flatMap((c) => [d, -d].map((s) => claimOk({ ...c, value: Math.max(0, c.value + s) }, actual.get(c)!))).filter(Boolean).length;
  console.log(`| ±${d * 100} points absolute | ${ok}/${cs.length * 2} (${pct(ok / (cs.length * 2))}) | - |`);
}
// Low rates: a claimed 4% passes for 0-9%. How many rate claims sit below 0.15, where ±0.05 is a third or more of the value?
const low = claims.filter((c) => FRACTION.has(c.metric) && c.value < 0.15);
console.log(`\nRate claims below 15%: ${low.length} (${low.map((c) => `${c.metric} ${JSON.stringify(c.scope)} ${c.value}`).join("; ")}); for these ±0.05 accepts a relative error of ${low.map((c) => pct(0.05 / Math.max(c.value, 0.01))).join(", ")}`);
// Wrong scope: keep the stated value but evaluate it on every sibling scope (other archetype, other round). A pass there means the
// check cannot tell which group a number belongs to.
const rounds = [...new Set(runs.map((r) => r.round))];
let tries = 0, passes = 0;
for (const c of claims) {
  const sibs: Claim["scope"][] = [
    ...(c.scope.archetype ? ARCHETYPES.filter((a) => a !== c.scope.archetype).map((a) => ({ ...c.scope, archetype: a })) : []),
    ...(c.scope.round !== undefined ? rounds.filter((r) => r !== c.scope.round).map((r) => ({ ...c.scope, round: r })) : []),
  ];
  for (const s of sibs) {
    const a = computeMetric({ ...c, scope: s }, personas, runs, sessions);
    if (a === null) continue;
    tries++;
    if (claimOk({ ...c, scope: s }, a)) passes++;
  }
}
console.log(`Wrong-scope claims (stated value moved to a sibling archetype or round) that still verify: ${passes}/${tries} (${pct(passes / tries)})`);

// ---------- 3. headline rates ----------
console.log(`\n## Headline rates (95% bootstrap over players, 2000 resamples, seed 1)\n\n| rate | value | players | rounds | bootstrap interval over players | Wilson (win rates: over rounds, too narrow as one player's rounds are correlated; quit rates: over players) |\n| --- | --- | --- | --- | --- | --- |`);
const heads: [string, Claim][] = [
  ["casual win rate", { metric: "winRate", scope: { archetype: "casual" }, value: 0 }],
  ["casual quit rate", { metric: "quitRate", scope: { archetype: "casual" }, value: 0 }],
  ["cheeser win rate", { metric: "winRate", scope: { archetype: "cheeser" }, value: 0 }],
  ["cheeser quit rate", { metric: "quitRate", scope: { archetype: "cheeser" }, value: 0 }],
  ["overall win rate", { metric: "winRate", scope: {}, value: 0 }],
  ["round 2 quit rate", { metric: "quitRate", scope: { round: 2 }, value: 0 }],
];
const arch = new Map(personas.map((p) => [p.id, p.archetype]));
for (const [name, c] of heads) {
  const v = computeMetric(c, personas, runs, sessions)!, iv = claimInterval(c, personas, runs, sessions)!;
  const rs = runs.filter((r) => (!c.scope.archetype || arch.get(r.p) === c.scope.archetype) && (c.scope.round === undefined || r.round === c.scope.round));
  const [wl, wh] = c.metric === "winRate" ? wilson(rs.filter((r) => r.out === "win").length, rs.length) : wilson(Math.round(v * iv.players), iv.players);
  console.log(`| ${name} | ${pct(v)} | ${iv.players} | ${rs.length} | ${pct(iv.lo)}-${pct(iv.hi)} | ${pct(wl)}-${pct(wh)} |`);
}

// ---------- 2b. a tighter tolerance (proposal for ai/verify.ts, not applied here) ----------
// Stated rates are whole percents, so honest copies sit within 0.005 of the value; 0.01 keeps a 2x margin. Other metrics: 2% relative.
const okTight = (c: Claim, a: number) => (FRACTION.has(c.metric) ? Math.abs(a - c.value) <= 0.01 : Math.abs(a - c.value) <= 0.02 * Math.max(Math.abs(a), 1e-9));
const allClaims = claimSets.filter(([, f]) => existsSync(f)).flatMap(([, f]) => (json(f).findings as Finding[]).flatMap((x) => x.verified ?? []));
console.log(`\nProposed tolerance (rates ±0.01 absolute, others ±2% relative): honest claims kept ${allClaims.filter((v) => okTight(v.claim, v.actual)).length}/${allClaims.length} (today ${allClaims.filter((v) => v.ok).length}/${allClaims.length}, across the three findings files)`);
for (const d of [0.05, 0.1]) {
  const ok = claims.flatMap((c) => [1 + d, 1 - d].map((m) => okTight({ ...c, value: c.value * m }, actual.get(c)!))).filter(Boolean).length;
  console.log(`- ±${d * 100}% relative shift still verified: ${ok}/${claims.length * 2}`);
}
const ok3 = claims.filter((c) => FRACTION.has(c.metric)).flatMap((c) => [0.03, -0.03].map((s) => okTight({ ...c, value: Math.max(0, c.value + s) }, actual.get(c)!))).filter(Boolean).length;
console.log(`- ±3 points absolute on rates still verified: ${ok3}/${claims.filter((c) => FRACTION.has(c.metric)).length * 2}`);
let t2 = 0, p2 = 0;
for (const c of claims) for (const s of [
  ...(c.scope.archetype ? ARCHETYPES.filter((a) => a !== c.scope.archetype).map((a) => ({ ...c.scope, archetype: a })) : []),
  ...(c.scope.round !== undefined ? rounds.filter((r) => r !== c.scope.round).map((r) => ({ ...c.scope, round: r })) : []),
]) { const a = computeMetric({ ...c, scope: s }, personas, runs, sessions); if (a === null) continue; t2++; if (okTight({ ...c, scope: s }, a)) p2++; }
console.log(`- wrong-scope claims still verified: ${p2}/${t2}`);
