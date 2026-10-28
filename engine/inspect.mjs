// Re-simulate one recorded round and print a 2 Hz timeline.  node engine/inspect.mjs p0653 2 [--dir data/run-main] [--from 10 --to 30]
import { readFileSync } from 'node:fs';
import { createSim } from './sim.mjs';
import { createPolicy } from './policy.mjs';
import { fighterFor } from './crowd-worker-lib.mjs';

const [pid, roundArg] = process.argv.slice(2);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('dir', 'data/run-main'), from = +arg('from', 0), to = +arg('to', 99);
const persona = JSON.parse(readFileSync(`${dir}/personas.json`, 'utf8')).find(p => p.id === pid);
const line = readFileSync(`${dir}/runs.jsonl`, 'utf8').trim().split('\n').map(JSON.parse).find(r => r.p === pid && r.round === +roundArg);
if (!persona || !line) { console.error('not found'); process.exit(1); }
const sim = await createSim({ seed: line.seed, fighter: fighterFor(pid) });
const policy = createPolicy(persona, line.seed);
const f = n => n.toFixed(2).padStart(6);
while (!sim.done) {
  sim.step(policy.step(sim));
  const t = sim.time();
  if (sim.tick % 30 === 0 && t >= from && t <= to) {
    const a = sim.player.rigidBody.translation(), b = sim.rival.rigidBody.translation();
    console.log(f(t), 'P', f(a.x), f(a.y), (sim.player.state + (sim.player.ground ? '/' + sim.player.ground.phase : '')).padEnd(18), sim.player.health, '| R', f(b.x), f(b.y), (sim.rival.state + (sim.rival.ground ? '/' + sim.rival.ground.phase : '')).padEnd(18), sim.rival.health,
      '| props', sim.props.map(p => p.isBroken ? 'broken' : (p.isCarried ? 'carried' : f(p.rigidBody.translation().x) + ',' + f(p.rigidBody.translation().y))).join(' '));
  }
}
const r = sim.result();
console.log('recorded', line.out, line.t, line.hp, '| replayed', r.out, r.t, r.hp, r.out === line.out && r.t === line.t ? 'MATCH' : 'DIFF');
sim.dispose();
