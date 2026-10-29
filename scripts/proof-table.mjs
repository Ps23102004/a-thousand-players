// Replays EVERY bug round of data/run-main/bugs.json twice with the engine: with the recorded build's rules (fixes off, the bug shows)
// and with the shipped game (fixes on, same seed, same persona), and writes docs/proof/engine-before-after.json and .md.
//   node scripts/proof-table.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createSim, runRound } from '../engine/sim.mjs';
import { createPolicy } from '../engine/policy.mjs';
import { fighterFor } from '../engine/crowd-worker-lib.mjs';
const BUG = new Set(['airborne', 'oob', 'clip', 'stuck', 'nan', 'softlock', 'crash']);
const personas = new Map(JSON.parse(readFileSync('data/run-main/personas.json', 'utf8')).map((p) => [p.id, p]));
const meta = JSON.parse(readFileSync('data/run-main/meta.json', 'utf8')).recordedWith;
const nerf = JSON.parse(readFileSync('data/patches/sweep-nerf.json', 'utf8'));
// Every flagged round in the recorded data (base crowd + sweep-nerf crowd), grouped by signature the way data/run-main/bugs.json does.
const readRuns = (f, label) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.p && r.ev && (label !== 'base' || r.tuning === 'base')).map((r) => ({ ...r, label }));
const flagged = [...readRuns('data/run-main/runs.jsonl', 'base'), ...readRuns('data/run-main/runs-sweep-nerf.jsonl', 'sweep-nerf')].filter((r) => r.ev.some((e) => BUG.has(e[1])));
const clusterOf = (r) => { const t = new Set(r.ev.filter((e) => BUG.has(e[1])).map((e) => e[1])); return t.has('crash') ? 'bug3' : t.has('stuck') ? 'bug4' : t.has('oob') ? 'bug2' : 'bug1'; };
const clusters = ['bug1', 'bug2', 'bug3', 'bug4'].map((id) => ({ id, rounds: flagged.filter((r) => clusterOf(r) === id) }));
async function play(r, fixed) {
  const patch = r.label === 'sweep-nerf' ? nerf : {};
  const sim = await createSim({ seed: r.seed, fighter: fighterFor(r.p), tuning: fixed ? { ...patch } : { ...meta, ...patch } });
  const res = await runRound(sim, createPolicy(personas.get(r.p), r.seed));
  try { sim.dispose(); } catch {}
  const bugs = [...new Set(res.ev.filter((e) => BUG.has(e[1])).map((e) => e[1]))];
  return { bugs, out: res.out, t: res.t };
}
const rows = [];
for (const c of clusters) for (const r of c.rounds) {
  const before = await play(r, false), after = await play(r, true);
  rows.push({ cluster: c.id, key: `${r.p}:${r.round}`, seed: r.seed, crowd: r.label, before, after });
}
const per = {};
for (const x of rows) { const s = (per[x.cluster] ??= { rounds: 0, bugBefore: 0, bugAfter: 0 }); s.rounds++; if (x.before.bugs.length) s.bugBefore++; if (x.after.bugs.length) s.bugAfter++; }
mkdirSync('docs/proof', { recursive: true });
writeFileSync('docs/proof/engine-before-after.json', JSON.stringify({ command: 'node scripts/proof-table.mjs', note: 'Every flagged round in the recorded data. Same seed and persona; before = recorded build rules (fix flags 0), after = shipped game.', perCluster: per, rows }, null, 1));
const md = ['| Bug | Rounds replayed | Bug events with the recorded build | Bug events with the shipped game |', '|---|---|---|---|', ...Object.entries(per).map(([k, s]) => `| ${k} | ${s.rounds} | ${s.bugBefore} of ${s.rounds} | ${s.bugAfter} of ${s.rounds} |`)].join('\n');
writeFileSync('docs/proof/engine-before-after.md', md + '\n');
console.log(md);
const left = rows.filter((x) => x.after.bugs.length).map((x) => `${x.cluster} ${x.key} ${x.after.bugs}`);
console.log('still showing a bug event after the fix:', left.length ? left.join('; ') : 'none');
