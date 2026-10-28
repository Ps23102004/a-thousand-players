import { ARCHETYPES, type Claim, type Ev, type Persona, type RunLine, type SessionEnd } from "../lib/types";
import { computeMetric, isQuit, seedKey } from "./verify";

// Measured on Ultra: this number-dense corpus tokenizes at ~1.6 chars/token (54,764 chars -> ~34,500 prompt tokens),
// so the usual chars/3.3 rule would undercount by 2x and blow the context budget.
export const estimateTokens = (text: string) => Math.ceil(text.length / 1.6);

const BUG_EVENTS = new Set(["stuck", "oob", "nan", "clip", "airborne", "softlock"]);
const TIMED_EVENTS = new Set(["knockdown", "throw", "prop", "mount"]);
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number | null) => (x === null ? "-" : `${Math.round(x * 100)}%`);

function header(personas: Persona[], runs: RunLine[], sessions: SessionEnd[]): string {
  const m = (metric: Claim["metric"], scope: Claim["scope"]) => computeMetric({ metric, scope, value: 0 }, personas, runs, sessions);
  const rounds = [...new Set(runs.map((r) => r.round))].sort((a, b) => a - b);
  const lines: string[] = [];
  lines.push(`players ${personas.length}, rounds played ${runs.length}, sessions ${sessions.length}`);
  lines.push(`overall: winRate ${pct(m("winRate", {}))}, koShare ${pct(m("koShare", {}))}, quitRate ${pct(m("quitRate", {}))}, avgDuration ${m("avgDuration", {})?.toFixed(1)}s, meanHpLoss ${m("meanHpLoss", {})?.toFixed(1)}`);

  lines.push("", "by archetype: players | rounds | winRate | koShare | quitRate | avgDuration s | meanHpLoss");
  for (const a of ARCHETYPES) {
    const ps = personas.filter((p) => p.archetype === a).length;
    if (!ps) continue;
    const s = { archetype: a };
    lines.push(`${a}: ${ps} | ${runs.filter((r) => personas.find((p) => p.id === r.p)?.archetype === a).length} | ${pct(m("winRate", s))} | ${pct(m("koShare", s))} | ${pct(m("quitRate", s))} | ${m("avgDuration", s)?.toFixed(1)} | ${m("meanHpLoss", s)?.toFixed(1)}`);
  }

  lines.push("", "by round: rounds | winRate | quitRate right after it | avgDuration s");
  for (const r of rounds) lines.push(`round ${r}: ${runs.filter((x) => x.round === r).length} | ${pct(m("winRate", { round: r }))} | ${pct(m("quitRate", { round: r }))} | ${m("avgDuration", { round: r })?.toFixed(1)}`);

  // Every cell carries its round label: with bare columns Ultra read the R3 quit rate as R2 in two runs out of two.
  for (const metric of ["winRate", "quitRate"] as const) {
    lines.push("", `${metric} by archetype x round${metric === "quitRate" ? " (quit right after that round)" : ""}:`);
    for (const a of ARCHETYPES) {
      if (!personas.some((p) => p.archetype === a)) continue;
      lines.push(`${a}: ${rounds.map((r) => `R${r} ${pct(m(metric, { archetype: a, round: r }))}`).join(", ")}`);
    }
  }

  const ts = runs.map((r) => r.t).sort((a, b) => a - b);
  const q = (f: number) => ts[Math.min(ts.length - 1, Math.floor(f * ts.length))]?.toFixed(1);
  lines.push("", `round duration quartiles s: min ${ts[0]?.toFixed(1)} q1 ${q(0.25)} median ${q(0.5)} q3 ${q(0.75)} max ${ts[ts.length - 1]?.toFixed(1)}`);

  const reasons: Record<string, number> = {};
  for (const s of sessions) reasons[s.quit.reason] = (reasons[s.quit.reason] ?? 0) + 1;
  lines.push(`session end reasons: ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(", ")}`);

  const evCount: Record<string, number> = {};
  for (const r of runs) for (const [, code, who, arg] of r.ev) {
    const k = `${code}${who === 0 ? "(player)" : "(rival)"}${code === "hit" && arg !== undefined ? ` ${arg}` : ""}`;
    evCount[k] = (evCount[k] ?? 0) + 1;
  }
  lines.push(`top events: ${Object.entries(evCount).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  return lines.join("\n");
}

/** One round at three levels of detail: 2 = with timed events, 1 = counts only, 0 = outcome only. Seeds are kept at every level. */
function roundText(r: RunLine, level: 0 | 1 | 2): string {
  const base = `R${r.round} s${r.seed} ${r.out[0].toUpperCase()} ${r.t.toFixed(1)}s hp${Math.round(r.hp[0])}/${Math.round(r.hp[1])}${r.ko ? ` ko@x${r.ko.x.toFixed(1)}` : ""}${r.live ? " LIVE" : ""}`;
  if (level === 0) return base;
  const myHits: Record<string, number> = {};
  let rivalHits = 0, blocks = 0, parries = 0;
  const timed: string[] = [];
  for (const e of r.ev as Ev[]) {
    const [t, code, who, arg] = e;
    if (code === "hit") { if (who === 0) myHits[String(arg ?? "?")] = (myHits[String(arg ?? "?")] ?? 0) + 1; else rivalHits++; }
    else if (code === "block" && who === 0) blocks++;
    else if (code === "parry" && who === 0) parries++;
    else if (BUG_EVENTS.has(code)) timed.push(`!${code}@${t.toFixed(1)}${arg !== undefined ? ` ${arg}` : ""}`);
    else if (level === 2 && TIMED_EVENTS.has(code)) timed.push(`${code}${who === 0 ? "" : "*"}@${t.toFixed(1)}`);
  }
  const moves = Object.entries(myHits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}x${v}`).join(",");
  return `${base} dmg${Math.round(r.dmg[0])}/${Math.round(r.dmg[1])} c${r.maxCombo} hits[${moves}] took${rivalHits} blk${blocks}${parries ? ` par${parries}` : ""} fr${f2(r.mood.frustration)} bo${f2(r.mood.boredom)}${timed.length ? ` {${timed.join(" ")}}` : ""}`;
}

function playerLine(p: Persona, rs: RunLine[], end: SessionEnd | undefined, level: 0 | 1 | 2): string {
  const head = `${p.id} ${p.archetype} sk${f2(p.skill)} pa${f2(p.patience)} ft${f2(p.frustration_tolerance)}`;
  const tail = end ? `END after R${end.quit.afterRound} ${end.quit.reason}` : "END ?";
  return [head, ...rs.map((r) => roundText(r, level)), tail].join(" | ");
}

/** Higher = keep more detail when trimming: invariant violations, unhappy quits, one-sided results. */
function interest(rs: RunLine[], end: SessionEnd | undefined): number {
  let s = 0;
  for (const r of rs) for (const e of r.ev) if (BUG_EVENTS.has(e[1])) s += 10;
  if (end && isQuit(end)) s += 2;
  const wins = rs.filter((r) => r.out === "win").length;
  if (rs.length >= 2 && (wins === rs.length || wins === 0)) s += 1;
  return s;
}

export const LEGEND = `Per-player line format: id archetype sk=skill pa=patience ft=frustration_tolerance | one block per round: R<round> s<seed> W/L/D <duration>s hp<player>/<rival> ko@x<loser x> dmg<dealt>/<taken> c<max combo> hits[player's landed moves x count] took<rival hits landed> blk<player blocks> par<player parries> fr<frustration> bo<boredom> {timed events: name@seconds, * = by rival, ! = invariant violation (bug)} | END after R<n> <reason>.
Quit = session ended for frustration or boredom ("satisfied" and "cap" are not quits).`;

export function buildCorpus(personas: Persona[], runs: RunLine[], sessions: SessionEnd[], opts: { maxTokens?: number } = {}): { text: string; tokenEstimate: number; seedIndex: Set<string> } {
  const budget = opts.maxTokens ?? 220_000;
  const byPlayer = new Map<string, RunLine[]>();
  for (const r of runs) byPlayer.set(r.p, [...(byPlayer.get(r.p) ?? []), r]);
  for (const rs of byPlayer.values()) rs.sort((a, b) => a.round - b.round);
  const ends = new Map(sessions.map((s) => [s.p, s]));
  const players = personas.filter((p) => byPlayer.has(p.id));

  const head = `# CROWD CORPUS (aggregates computed by code from all runs, exact)\n${header(personas, runs, sessions)}\n\n${LEGEND}\n\n# PLAYERS\n`;
  const level = new Map<string, 0 | 1 | 2>(players.map((p) => [p.id, 2]));
  const text = (p: Persona) => playerLine(p, byPlayer.get(p.id)!, ends.get(p.id), level.get(p.id)!);
  const lineTokens = new Map(players.map((p) => [p.id, estimateTokens(text(p)) + 1]));
  let total = estimateTokens(head) + [...lineTokens.values()].reduce((s, x) => s + x, 0);

  // Trim the least interesting players first: full -> counts only -> outcome only -> omitted (counted in the corpus).
  const order = [...players].sort((a, b) => interest(byPlayer.get(a.id)!, ends.get(a.id)) - interest(byPlayer.get(b.id)!, ends.get(b.id)));
  const trimmed = { counts: 0, outcome: 0 };
  const omitted: Persona[] = [];
  for (const target of [1, 0] as const) {
    for (const p of order) {
      if (total <= budget) break;
      level.set(p.id, target);
      const t = estimateTokens(text(p)) + 1;
      total += t - lineTokens.get(p.id)!;
      lineTokens.set(p.id, t);
      if (target === 1) trimmed.counts++; else { trimmed.counts--; trimmed.outcome++; }
    }
  }
  for (const p of order) {
    if (total <= budget) break;
    omitted.push(p);
    total -= lineTokens.get(p.id)!;
  }
  const omittedSet = new Set(omitted.map((p) => p.id));
  let note = "";
  if (trimmed.counts || trimmed.outcome || omitted.length) {
    note = `(Token budget ${budget}: ${trimmed.counts} players shown without timed events, ${trimmed.outcome} shown with outcome only, ${omitted.length} omitted from per-player lines but included in the aggregates.)\n`;
    console.error(`[corpus] ${note.trim()}`);
  }
  const body = players.filter((p) => !omittedSet.has(p.id)).map(text).join("\n");
  const full = head + note + body;
  return { text: full, tokenEstimate: estimateTokens(full), seedIndex: new Set(runs.map((r) => seedKey(r.p, r.round, r.seed))) };
}
