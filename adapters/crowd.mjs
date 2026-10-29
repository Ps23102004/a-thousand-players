// Crowd runner for the non-Market-Brawl adapters: N personas + M fuzzers, one round each, then every round
// that raised an invariant event (and a sample of clean ones) is replayed from its recorded inputs to check
// the hash matches. No model calls: personas come from data/run-main/personas.json or syntheticPersona-style.
//   node --import tsx adapters/crowd.mjs --game homeground --n 100 --fuzz 100 --seed 1
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadPersonas } from './lib/common.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const game = arg('game', 'homeground'), n = +arg('n', 100), nFuzz = +arg('fuzz', 100), seed0 = +arg('seed', 1), maxT = arg('maxT');
const BUGS = { homeground: ['crash', 'nan', 'clip', 'oob', 'tunnel', 'overspeed', 'stuck', 'softlock', 'airborne'],
  'clean-getaway': ['crash', 'nan', 'oob', 'dup-seat', 'stuck', 'softlock', 'bad-outcome'] }[game];
const sim = await import(`./${game}/sim.mjs`), pol = await import(`./${game}/policy.mjs`);

const players = [...loadPersonas(n).map(p => ({ id: p.id, archetype: p.archetype, make: s => pol.createPolicy(p, s) })),
  ...Array.from({ length: nFuzz }, (_, i) => ({ id: 'fuzz' + i, archetype: 'fuzz', make: s => pol.createFuzzer(s) }))];

const runs = [], t0 = performance.now();
let simSeconds = 0;
for (const [i, pl] of players.entries()) {
  const seed = seed0 * 100_003 + i;
  const r = await sim.runRound(sim.createSim({ seed, maxT: maxT && +maxT }), pl.make(seed));
  simSeconds += r.t;
  runs.push({ p: pl.id, arch: pl.archetype, seed, ...r, bugs: r.ev.filter(e => BUGS.includes(e[1])) });
}
const wall = (performance.now() - t0) / 1000;

// Determinism: replay every bugged round + every 10th round from its inputs alone.
let replayed = 0, matched = 0;
const mismatches = [];
for (const [i, r] of runs.entries()) {
  if (!r.bugs.length && i % 10) continue;
  const again = await sim.runRound(sim.createSim({ seed: r.seed, maxT: maxT && +maxT }), sim.inputController(r.inputs));
  replayed++;
  if (again.hash === r.hash && JSON.stringify(again.ev) === JSON.stringify(r.ev)) { matched++; r.replay = 'match'; } else { r.replay = 'MISMATCH'; mismatches.push(r.p); }
}

const byKind = {}, clusters = {};
for (const r of runs) for (const e of r.bugs) {
  byKind[e[1]] = (byKind[e[1]] || 0) + 1;
  const sig = e[1] + (typeof e[2] === 'string' && !/^-?\d/.test(e[2]) ? ':' + e[2].replace(/[\d.,-]+/g, '#').slice(0, 60) : '');
  (clusters[sig] ||= { sig, rounds: 0, personas: 0, fuzz: 0, example: null }).rounds++;
  clusters[sig][r.arch === 'fuzz' ? 'fuzz' : 'personas']++;
  clusters[sig].example ||= { p: r.p, seed: r.seed, t: e[0], arg: e[2], replay: r.replay };
}
const outcomes = {}; for (const r of runs) outcomes[r.out] = (outcomes[r.out] || 0) + 1;
const summary = {
  game, rounds: runs.length, personas: n, fuzzers: nFuzz, seed: seed0, wallSeconds: +wall.toFixed(2), roundsPerSecond: +(runs.length / wall).toFixed(1),
  simSecondsPerWallSecond: +(simSeconds / wall).toFixed(0), outcomes, roundsWithBugs: runs.filter(r => r.bugs.length).length,
  roundsStalled: runs.filter(r => r.ev.some(e => e[1] === 'stalled')).length, eventsByKind: byKind,
  clusters: Object.values(clusters).sort((a, b) => b.rounds - a.rounds), replayed, replayMatched: matched, mismatches,
};
const dir = new URL(`./${game}/out/`, import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('summary.json', dir), JSON.stringify(summary, null, 1));
writeFileSync(new URL('runs.jsonl', dir), runs.map(r => JSON.stringify({ ...r, inputs: r.inputs.length > 400 ? `${r.inputs.length} inputs` : r.inputs })).join('\n') + '\n');
console.log(JSON.stringify(summary, null, 1));
