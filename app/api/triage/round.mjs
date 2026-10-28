// Plays ONE recorded round in a fresh Node process for the live triage route: the game modules keep module-level state and a
// WASM crash poisons the Rapier instance, so each replay gets its own realm (engine/bugs.mjs and verify-fix.mjs do the same).
// With `window` set it also captures the 10 Hz evidence timeline that engine/bugs.mjs feeds to Ultra (same row format).
//   node app/api/triage/round.mjs <engineDir> '{"seed":529060,"fighter":"kai","tuning":{"rules.mountReleaseFix":0},"persona":{...},"window":[14.5,20.5]}'
// Prints one JSON line: { out, t, hp, ev, crash, timeline }.
import { pathToFileURL } from 'node:url';

const [engineDir, jobJson] = process.argv.slice(2);
const job = JSON.parse(jobJson);
const mod = f => import(pathToFileURL(`${engineDir}/${f}`).href);
const { createSim, runRound } = await mod('sim.mjs');
const { createPolicy } = await mod('policy.mjs');

const sim = await createSim({ seed: job.seed, fighter: job.fighter, tuning: job.tuning });
const policy = createPolicy(job.persona, job.seed);
const [from, to] = job.window ?? [Infinity, -Infinity];
const rows = [];
let seen = 0;
const f2 = n => Math.round(n * 100) / 100;
const fo = f => { const p = f.rigidBody.translation(); return `${f.name} x=${f2(p.x)} y=${f2(p.y)} ${f.state}${f.ground ? '/ground:' + f.ground.phase : ''}${f.mount ? '/mount:' + f.mount.phase : ''}${f.grapple ? '/grapple:' + f.grapple.phase : ''}${f.carriedProp ? '/carrying' + (f.carriedProp.isBroken ? '(BROKEN crate)' : ' crate') : ''} hp=${f.health}`; };
const events = () => { for (; seen < sim.events.length; seen++) { const e = sim.events[seen]; if (e[0] >= from && e[0] <= to) rows.push(`${e[0].toFixed(2)}s EVENT ${e[1]} by ${e[2] ? 'CPU' : 'player'}${e[3] !== undefined ? ' ' + e[3] : ''}`); } };
// Called before each tick, i.e. right after the previous one: same state/intent pairing as the post-step log in bugs.mjs.
const capture = () => {
  events();
  const t = sim.time();
  if (sim.tick > 0 && sim.tick % 6 === 0 && t >= from && t <= to) rows.push(`${t.toFixed(2)}s player[${fo(sim.player)}] cpu[${fo(sim.rival)}] crates[${sim.props.map(p => p.isBroken ? 'broken' : p.isCarried ? 'carried' : `x=${f2(p.rigidBody.translation().x)} y=${f2(p.rigidBody.translation().y)}`).join('; ')}] keys=${policy.lastAction}`);
};
const controller = job.window ? { step(s) { capture(); return policy.step(s); } } : policy;
const res = await runRound(sim, controller);
events();
if (sim.crashed) rows.push(`CRASH ${sim.crashed}`);
console.log(JSON.stringify({ out: res.out, t: res.t, hp: res.hp, ev: res.ev, crash: sim.crashed || null, timeline: rows }));
