// Shared by engine/tests/hunt-*.test.mjs (bug hunt, docs/bug-hunt.md). Not a test file itself.
// Input fuzzers that ignore the game state, and a per-tick invariant check that is stricter than the sim's own
// 10 Hz checks: it also covers the crates and posture, which the crowd run never looks at.
import { createSim, runRound, mulberry32, KEYS, BIT } from '../sim.mjs';

const ALL = (1 << KEYS.length) - 1, ATTACKS = BIT.KeyJ | BIT.KeyK | BIT.KeyL | BIT.KeyF | BIT.KeyE;

/** mode -> (rng, tick) -> key mask. */
export const FUZZ_MODES = {
  random: rng => rng() * (ALL + 1) | 0, // a fresh random key mask every tick
  mash: (rng, tick) => (tick & 1 ? 0 : ATTACKS & (rng() * (ALL + 1) | 0)) | (rng() < 0.5 ? BIT.KeyD : BIT.KeyA), // attack keys toggled every tick while walking
  holdAll: () => ALL,
  flicker: (rng, tick) => (tick % 3 ? ALL : 0), // all keys, released one tick in three
  taps: rng => (rng() < 0.15 ? 1 << (rng() * KEYS.length | 0) : 0), // single-key taps
};

export function fuzzController(mode, seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9), f = FUZZ_MODES[mode];
  return { step: sim => f(rng, sim.tick) };
}

const finite = (...v) => v.every(Number.isFinite);
/** Invariants a correct match never breaks, checked on the state the controller sees each tick. */
export function violations(sim) {
  const out = [];
  for (const [name, f] of [['player', sim.player], ['rival', sim.rival]]) {
    const p = f.rigidBody.translation();
    if (!finite(p.x, p.y, p.z, f.health, f.posture)) out.push(`${name} non-finite`);
    else {
      if (Math.abs(p.x) > 10.45 || p.y < -0.6 || Math.abs(p.z) > 2.3) out.push(`${name} out of arena x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`);
      if (f.health < 0 || f.health > f.maxHealth) out.push(`${name} health ${f.health}`);
      if (f.posture < 0 || f.posture > f.maxPosture + 1e-9) out.push(`${name} posture ${f.posture}`);
    }
  }
  sim.props.forEach((c, i) => {
    if (c.isBroken || c.isCarried) return;
    const p = c.rigidBody.translation();
    if (!finite(p.x, p.y, p.z)) out.push(`crate${i} non-finite`);
    else if (Math.abs(p.x) > 10.45 || p.y < -0.6 || Math.abs(p.z) > 2.3) out.push(`crate${i} out of arena x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`);
  });
  return out;
}

/** Play one round under `controller`, checking invariants every tick. Returns {res, sim, bad: [{t, what}]} (first hit per kind). */
export async function checkedRound(controller, opts) {
  const sim = await createSim(opts), bad = [], seen = new Set();
  const res = await runRound(sim, {
    step(s) {
      for (const what of violations(s)) { const k = what.split(' ').slice(0, 2).join(' '); if (!seen.has(k)) { seen.add(k); bad.push({ t: +s.time().toFixed(2), what }); } }
      return controller.step(s);
    },
  });
  if (!sim.crashed) sim.dispose();
  return { res, sim, bad };
}
