// Cluster every invariant violation / crash the crowd hit, then re-simulate one seed per cluster and
// capture a 10 Hz evidence timeline around the first bug event (what the triage model reads with the source).
//   node engine/bugs.mjs --dir data/run-main --labels base,sweep-nerf
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createSim } from './sim.mjs';
import { createPolicy } from './policy.mjs';
import { fighterFor } from './crowd-worker-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('dir', 'data/run-main'), labels = arg('labels', 'base').split(',');
const BUG = ['crash', 'stuck', 'oob', 'nan', 'clip', 'airborne', 'softlock'];
const personas = Object.fromEntries(JSON.parse(readFileSync(`${dir}/personas.json`, 'utf8')).map(p => [p.id, p]));
const tuningFor = label => (label === 'base' ? null : JSON.parse(readFileSync(`data/patches/${label}.json`, 'utf8')));

const clusters = new Map();
for (const label of labels) {
  const file = `${dir}/runs${label === 'base' ? '' : '-' + label}.jsonl`;
  if (!existsSync(file)) continue;
  for (const l of readFileSync(file, 'utf8').trim().split('\n')) {
    const r = JSON.parse(l), bugs = r.ev.filter(e => BUG.includes(e[1]));
    if (!bugs.length) continue;
    // Signature: the set of bug kinds in the round (+ state / crash site), e.g. "airborne+stuck:KNOCKDOWN+softlock".
    const sig = [...new Set(bugs.map(e => (e[1] === 'stuck' || e[1] === 'crash') ? `${e[1]}:${e[3]}` : e[1]))].sort((a, b) => BUG.indexOf(a.split(':')[0]) - BUG.indexOf(b.split(':')[0])).join('+');
    if (!clusters.has(sig)) clusters.set(sig, { signature: sig, rounds: [] });
    clusters.get(sig).rounds.push({ p: r.p, round: r.round, seed: r.seed, label, t: r.t, out: r.out, firstBug: bugs[0] });
  }
}

const f2 = n => Math.round(n * 100) / 100;
async function evidence(rep) {
  const persona = personas[rep.p], tuning = tuningFor(rep.label);
  const sim = await createSim({ seed: rep.seed, fighter: fighterFor(rep.p), tuning });
  const policy = createPolicy(persona, rep.seed);
  const from = Math.max(0, rep.firstBug[0] - 4), to = rep.firstBug[0] + 2, rows = [];
  const fo = f => { const p = f.rigidBody.translation(); return `${f.name} x=${f2(p.x)} y=${f2(p.y)} ${f.state}${f.ground ? '/ground:' + f.ground.phase : ''}${f.mount ? '/mount:' + f.mount.phase : ''}${f.grapple ? '/grapple:' + f.grapple.phase : ''}${f.carriedProp ? '/carrying' + (f.carriedProp.isBroken ? '(BROKEN crate)' : ' crate') : ''} hp=${f.health}`; };
  let seen = 0, crashed = false;
  try {
    while (!sim.done && sim.time() <= to) {
      sim.step(policy.step(sim));
      for (; seen < sim.events.length; seen++) { const e = sim.events[seen]; if (e[0] >= from) rows.push(`${e[0].toFixed(2)}s EVENT ${e[1]} by ${e[2] ? 'CPU' : 'player'}${e[3] !== undefined ? ' ' + e[3] : ''}`); }
      if (sim.tick % 6 === 0 && sim.time() >= from) rows.push(`${sim.time().toFixed(2)}s player[${fo(sim.player)}] cpu[${fo(sim.rival)}] crates[${sim.props.map(p => p.isBroken ? 'broken' : p.isCarried ? 'carried' : `x=${f2(p.rigidBody.translation().x)} y=${f2(p.rigidBody.translation().y)}`).join('; ')}] keys=${policy.lastAction}`);
    }
  } catch (e) { crashed = true; rows.push(`CRASH ${e.message}`); }
  for (; seen < sim.events.length; seen++) { const e = sim.events[seen]; if (e[0] >= from) rows.push(`${e[0].toFixed(2)}s EVENT ${e[1]} by ${e[2] ? 'CPU' : 'player'}${e[3] !== undefined ? ' ' + e[3] : ''}`); }
  if (!crashed) sim.dispose();
  return rows;
}

// Each evidence re-simulation runs in its own process: a crash round poisons the WASM instance.
if (process.argv.includes('--evidence')) { console.log(JSON.stringify(await evidence(JSON.parse(arg('evidence'))))); process.exit(0); }
const evidenceIn = rep => {
  try { return JSON.parse(execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--evidence', JSON.stringify(rep), '--dir', dir], { encoding: 'utf8', maxBuffer: 1e7 }).trim().split('\n').pop()); }
  catch (e) { return [`evidence unavailable: ${String(e.message).slice(0, 80)}`]; }
};
const out = [];
let i = 0;
for (const c of [...clusters.values()].sort((a, b) => b.rounds.length - a.rounds.length)) {
  const rep = c.rounds.find(r => r.label === 'base') || c.rounds[0];
  out.push({ id: `bug${++i}`, signature: c.signature, count: c.rounds.length, rounds: c.rounds.slice(0, 8), representative: rep, timeline: evidenceIn(rep) });
  console.error(`${c.signature.padEnd(48)} ${c.rounds.length} rounds  e.g. ${rep.p} r${rep.round} seed ${rep.seed} (${rep.label})`);
}
writeFileSync(`${dir}/bugs.json`, JSON.stringify(out, null, 1));
console.error(`wrote ${out.length} clusters to ${dir}/bugs.json`);
