// Synthetic test crowd with planted stories, to prove the report path end to end before the real engine data exists.
// npx tsx ai/cli/make-fixture.ts [--n 150] [--dir data/fixtures-ai]  -> <dir>/personas.json, <dir>/runs.jsonl
// Planted: (1) rushers get crushed in round 2 and rage-quit, (2) ONE cheeser spams SWEEP and wins every round fast,
// (3) three turtle rounds hit a "stuck" invariant violation in the left corner and time out, (4) turtle rounds are long and boring.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Archetype, Ev, Persona, RunLine, SessionEnd } from "../../lib/types";
import { archetypeCounts } from "../personas";

let s = 12345;
const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const r1 = (x: number) => Math.round(x * 10) / 10;

const NAMES = ["Ana", "Ben", "Chen", "Dara", "Eli", "Femi", "Gus", "Hana", "Ivo", "Jun", "Kai", "Lena", "Mo", "Nia", "Oto", "Pia", "Quin", "Rae", "Sol", "Tao"];
const MOVES = ["JAB", "CROSS", "HOOK", "ROUNDHOUSE_KICK", "BODY_JAB", "UPPERCUT", "SWEEP", "HIGH_KICK"];

const { values } = parseArgs({ options: { n: { type: "string", default: "150" }, dir: { type: "string", default: "data/fixtures-ai" } } });
const counts = archetypeCounts(Number(values.n));
const personas: Persona[] = [];
for (const [a, c] of Object.entries(counts) as [Archetype, number][]) for (let i = 0; i < c; i++) {
  personas.push({
    id: `p${String(personas.length + 1).padStart(4, "0")}`, name: pick(NAMES), archetype: a,
    skill: r1(between(0.2, 0.9)), reaction_ticks: Math.round(between(8, 36)), patience: r1(between(0.2, 0.9)), frustration_tolerance: r1(between(0.2, 0.9)),
    bio: `Synthetic ${a} test persona number ${i + 1} for the fixture crowd.`, rules: [],
  });
}
const sweeper = personas.find((p) => p.archetype === "cheeser")!;
const stuckRounds = new Set(personas.filter((p) => p.archetype === "turtle").slice(0, 3).map((p) => `${p.id}:1`));

const lines: (RunLine | SessionEnd)[] = [];
let seed = 80000;
for (const p of personas) {
  let played = 0;
  let quit: SessionEnd["quit"] | null = null;
  for (let round = 1; round <= 3 && !quit; round++) {
    played = round;
    const ev: Ev[] = [];
    let winP = 0.35 + p.skill * 0.3;
    let t = p.archetype === "turtle" ? between(60, 90) : p.archetype === "speedrunner" ? between(20, 35) : between(30, 60);
    let myMoves = MOVES;
    const rusherR2 = p.archetype === "rusher" && round === 2;
    if (rusherR2) { winP = 0.06; t = between(14, 24); }
    if (p.id === sweeper.id) { winP = 1; t = between(15, 20); myMoves = ["SWEEP", "SWEEP", "SWEEP", "SWEEP", "JAB"]; }
    const stuck = stuckRounds.has(`${p.id}:${round}`);
    const win = !stuck && rand() < winP;
    const hits = Math.round(t / 4);
    for (let i = 0; i < hits; i++) ev.push([r1(between(0, t)), "hit", 0, pick(myMoves)]);
    for (let i = 0; i < hits; i++) if (p.id !== sweeper.id) ev.push([r1(between(0, t)), "hit", 1, rusherR2 ? "UPPERCUT" : pick(MOVES)]);
    if (p.archetype === "turtle") for (let i = 0; i < 8; i++) ev.push([r1(between(0, t)), "block", 0]);
    if (rand() < 0.4) ev.push([r1(between(0, t)), "knockdown", win ? 1 : 0]);
    if (stuck) { t = 99; ev.push([r1(between(30, 50)), "stuck", 0, "BLOCK"]); }
    ev.sort((a, b) => a[0] - b[0]);
    const hpP = stuck ? 41 : win ? Math.round(p.id === sweeper.id ? between(88, 100) : between(10, 80)) : 0;
    const hpR = stuck ? 37 : win ? 0 : Math.round(between(5, 70));
    const frustration = rusherR2 ? between(0.7, 1) : win ? between(0, 0.3) : between(0.3, 0.7);
    const boredom = p.archetype === "turtle" ? between(0.5, 0.9) : between(0, 0.4);
    lines.push({
      p: p.id, round, seed: seed++, tuning: "base", out: stuck ? "draw" : win ? "win" : "loss", t: r1(t), hp: [hpP, hpR],
      ko: stuck ? null : { x: r1(between(-6, 6)), t: r1(t) }, ev, dmg: [100 - hpR, 100 - hpP], maxCombo: p.id === sweeper.id ? 6 : Math.round(between(1, 4)),
      mood: { frustration: r1(frustration), boredom: r1(boredom) },
    });
    if (rusherR2 && rand() < 0.65) quit = { afterRound: round, reason: "frustration" };
    else if (p.archetype === "turtle" && rand() < 0.35) quit = { afterRound: round, reason: "boredom" };
    else if (p.archetype !== "rusher" && p.id !== sweeper.id && rand() < 0.08) quit = { afterRound: round, reason: rand() < 0.5 ? "frustration" : "satisfied" };
  }
  lines.push({ p: p.id, quit: quit ?? { afterRound: played, reason: "cap" } });
}

mkdirSync(values.dir!, { recursive: true });
writeFileSync(`${values.dir}/personas.json`, JSON.stringify(personas, null, 1));
writeFileSync(`${values.dir}/runs.jsonl`, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
console.error(`fixture: ${personas.length} personas, ${lines.length} lines; sweeper ${sweeper.id}; stuck rounds ${[...stuckRounds].join(", ")}`);
