// Persona -> keys for a downhill board. Same shape as engine/policy.mjs (archetype base table per
// situation bucket, weighted pick, reaction delay from reaction_ticks, skill-scaled reactivity), but the
// action vocabulary is riding, not fighting. Persona `rules` are Market Brawl tables and are ignored here.
import { BIT } from './sim.mjs';
import { mulberry32, hashString, pick } from '../lib/common.mjs';

const W = (road, offroad, wall, air) => ({ road, offroad, wall, air, bail: { wait: 1 } });
export const BASE = {
  turtle:      W({ follow: 4, brake: 3, cruise: 2 },              { back_to_road: 6, brake: 3 },          { avoid: 6, brake: 4 },        { wait: 1 }),
  rusher:      W({ pump: 5, tuck: 4, follow: 2 },                 { back_to_road: 3, pump: 3, tuck: 2 },  { avoid: 3, pump: 2 },         { tuck: 1 }),
  masher:      W({ carve_l: 3, carve_r: 3, pump: 3, tuck: 1 },    { carve_l: 3, carve_r: 3, pump: 2 },    { carve_l: 2, carve_r: 2 },    { carve_l: 1, carve_r: 1 }),
  learner:     W({ follow: 5, pump: 2, tuck: 1 },                 { back_to_road: 6, pump: 1 },           { avoid: 6 },                  { wait: 1 }),
  cheeser:     W({ ram_wall: 3, carve_l: 2, carve_r: 2, pump: 2 },{ ram_wall: 4, wander: 2 },             { ram_wall: 5, pump: 2 },      { carve_l: 1, carve_r: 1 }),
  casual:      W({ cruise: 4, follow: 2, wait: 2 },               { back_to_road: 3, wait: 2 },           { avoid: 3, brake: 2 },        { wait: 1 }),
  speedrunner: W({ tuck: 6, downhill: 3, pump: 2 },               { downhill: 5, tuck: 3 },               { avoid: 4, tuck: 1 },         { tuck: 1 }),
  explorer:    W({ wander: 4, cross_street: 3, pump: 2 },         { wander: 5, pump: 2 },                 { avoid: 3, wander: 2 },       { carve_l: 1, carve_r: 1 }),
};

const steerTo = (err, deadband) => (err > deadband ? BIT.right : err < -deadband ? BIT.left : 0);

/** @returns {{step(sim): number, lastAction: string, actions: object}} */
export function createPolicy(persona, seed) {
  const rng = mulberry32((seed ^ hashString(persona.id)) >>> 0);
  const skill = persona.skill ?? 0.5, deadband = 0.25 - 0.2 * skill;
  let action = 'wait', nextDecide = 0, pumpPhase = 0, wanderSide = rng() < 0.5 ? -1 : 1;
  const policy = { lastAction: 'wait', actions: {} };

  function decide(sim, o) {
    const base = BASE[persona.archetype] ?? BASE.casual;
    action = pick(base[o.bucket] ?? { wait: 1 }, rng);
    // Low skill sometimes fumbles the choice, like a late or wrong key press.
    if (rng() > 0.5 + 0.5 * skill) action = pick({ carve_l: 1, carve_r: 1, wait: 1, brake: 1 }, rng);
    if (action === 'wander' && rng() < 0.3) wanderSide = -wanderSide;
    policy.lastAction = action; policy.actions[action] = (policy.actions[action] || 0) + 1;
    nextDecide = sim.tick + Math.max(4, Math.round(persona.reaction_ticks * (0.8 + rng() * 0.4)));
  }

  policy.step = sim => {
    const o = sim.observe();
    if (sim.tick >= nextDecide) decide(sim, o);
    pumpPhase = (pumpPhase + 1) % 30; // pumping is a rhythm: press, release (each press is one push)
    const pump = pumpPhase < 15 ? BIT.throttle : 0;
    const followRoad = steerTo(o.headingErr - o.roadOffset * 0.15, deadband);
    switch (action) {
      case 'follow': return followRoad | (o.speed < 6 ? pump : 0);
      case 'cruise': return followRoad;
      case 'pump': return pump | followRoad;
      case 'tuck': return BIT.tuck | followRoad;
      case 'brake': return BIT.brake | followRoad;
      case 'downhill': return BIT.tuck | steerTo(o.downhillErr, deadband);
      case 'back_to_road': return steerTo(o.headingErr - o.roadOffset * 0.3, deadband) | pump;
      case 'avoid': return (o.roadOffset > 0 ? BIT.left : BIT.right) | BIT.brake;
      case 'ram_wall': return (o.roadOffset > 0 ? BIT.right : BIT.left) | pump; // aim at the buildings beside the road
      case 'wander': return (wanderSide > 0 ? BIT.right : BIT.left) | (rng() < 0.5 ? pump : 0);
      case 'cross_street': return steerTo(o.headingErr + Math.PI / 2 * wanderSide, deadband) | pump;
      case 'carve_l': return BIT.left | pump;
      case 'carve_r': return BIT.right | pump;
      default: return 0;
    }
  };
  return policy;
}

/** Random-input fuzzer: holds a random 5-bit mask for a random 1..40 frames. */
export function createFuzzer(seed) {
  const rng = mulberry32(seed ^ 0xf00d);
  let mask = 0, until = 0;
  return { lastAction: 'fuzz', step(sim) { if (sim.tick >= until) { mask = Math.floor(rng() * 32); until = sim.tick + 1 + Math.floor(rng() * 40); } return mask; } };
}
