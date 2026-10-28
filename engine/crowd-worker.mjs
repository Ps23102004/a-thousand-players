// Worker thread: plays whole sessions (1-5 rounds, with a frustration/boredom quit model) for a batch of personas.
// Mood is a deliberately simple hypothesis generator, not a claim about real players (see README "Honest limits").
import { parentPort, workerData } from 'node:worker_threads';
import { createSim, runRound, mulberry32, hashString } from './sim.mjs';
import { createPolicy } from './policy.mjs';

const { tuning, label, baseSeed, traceFirstRound, maxRounds, noQuit } = workerData; // noQuit: fixed-length evaluation (Exploit mode)
const clamp01 = x => Math.max(0, Math.min(1, x));

export function roundSeed(pid, round, base) { return 100000 + (hashString(`${pid}:${round}:${base}`) % 900000); }
export function fighterFor(pid) { return hashString(pid) % 2 ? 'rook' : 'kai'; }

function moodAfter(persona, mood, res, rr) {
  const count = (code, who) => res.ev.filter(e => e[1] === code && e[2] === who).length;
  const downs = count('knockdown', 0), lost = res.out === 'loss', won = res.out === 'win';
  const stale = res.ev.some(e => e[1] === 'softlock');
  let f = mood.frustration, b = mood.boredom;
  if (lost) f += 0.2 + 0.2 * (res.dmg[1] / 100) + 0.04 * downs; else if (won) f -= 0.15; else f += 0.05;
  f = clamp01(0.92 * f + (lost ? 0 : 0) );
  f = clamp01(mood.frustration + (f - mood.frustration) * (1 - 0.6 * persona.frustration_tolerance));
  if (stale) b += 0.3;
  if (res.t > 60) b += 0.15;
  if (won && res.hp[0] > 80) b += 0.2;
  if (res.maxCombo >= 3) b -= 0.1;
  if (count('knockdown', 1) > 0) b -= 0.05;
  if (res.t < 15 && lost) b += 0.05; // blink-and-you're-dead rounds feel unfair, not engaging
  return { frustration: +clamp01(f).toFixed(3), boredom: +clamp01(b).toFixed(3) };
}

async function playPersona(persona) {
  const rng = mulberry32(hashString('session:' + persona.id) ^ baseSeed);
  const lines = [], traces = {}; let mood = { frustration: 0.05, boredom: 0 }, wins = 0, quit = null;
  for (let round = 1; round <= maxRounds; round++) {
    const seed = roundSeed(persona.id, round, baseSeed);
    const sim = await createSim({ seed, tuning, fighter: fighterFor(persona.id), trace: traceFirstRound && round === 1 });
    const res = await runRound(sim, createPolicy(persona, seed));
    if (sim.crashed) poisoned = true; else sim.dispose();
    mood = moodAfter(persona, mood, res, round);
    if (res.out === 'win') wins++;
    lines.push({ p: persona.id, round, seed, tuning: label, out: res.out, t: res.t, hp: res.hp, ko: res.ko, ev: res.ev, dmg: res.dmg, maxCombo: res.maxCombo, mood });
    if (res.trace) traces[`${persona.id}:${round}:${seed}`] = { key: `${persona.id}:${round}:${seed}`, dt: 0.1, f: res.trace.f, ev: res.ev };
    if (poisoned) { quit = { afterRound: round, reason: 'crash' }; break; }
    if (noQuit) continue;
    if (mood.frustration > 0.3 + 0.6 * persona.patience) { quit = { afterRound: round, reason: 'frustration' }; break; }
    if (mood.boredom > 0.6) { quit = { afterRound: round, reason: 'boredom' }; break; }
    if (round >= 2 && wins >= 2 && rng() < 0.5) { quit = { afterRound: round, reason: 'satisfied' }; break; }
  }
  return { lines, traces, session: { p: persona.id, quit: quit || { afterRound: maxRounds, reason: 'cap' } } };
}

// After a crash the WASM instance is suspect: report, hand back the unplayed personas, and let the pool respawn us.
let poisoned = false;
parentPort.on('message', async personas => {
  const out = [];
  for (let i = 0; i < personas.length; i++) {
    out.push(await playPersona(personas[i]));
    if (poisoned) { parentPort.postMessage({ out, rest: personas.slice(i + 1), poisoned: true }); return; }
  }
  parentPort.postMessage({ out, rest: [] });
});
