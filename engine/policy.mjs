// Persona -> key presses. A persona is a sparse decision table (written by Nemotron Nano) on top of an
// archetype base table; this runner executes it natively at 60 Hz so 1000 players cost zero model calls per tick.
import { BIT, mulberry32, hashString, distBucket } from './sim.mjs';
import { getGroundPrompt } from '../game/src/ground.js';
import { getGrapplePrompt } from '../game/src/grapple.js';

const W = (far, mid, close) => ({ far, mid, close });
export const BASE = {
  turtle:      W({ advance: 3, block: 2, wait: 3 },            { block: 5, retreat: 2, punch: 2, parry: 1 },                   { block: 5, punch: 2, grab: 1, retreat: 1 }),
  rusher:      W({ advance: 9 },                                { advance: 4, kick: 3, punch: 3 },                              { punch: 5, kick: 3, grab: 1, low_punch: 1 }),
  masher:      W({ advance: 4, punch: 2, kick: 2, jump: 1 },   { punch: 5, kick: 3, low_punch: 2, advance: 2, jump: 1 },      { punch: 6, kick: 3, low_punch: 2, sweep: 1 }),
  learner:     W({ advance: 4, wait: 2 },                       { advance: 2, punch: 2, kick: 2, block: 2, parry: 1 },          { punch: 3, kick: 2, block: 2, grab: 1, parry: 1 }),
  cheeser:     W({ advance: 4, wait: 1 },                       { sweep: 6, advance: 2, low_punch: 2 },                         { sweep: 8, low_punch: 2, block: 1, grab: 1 }),
  casual:      W({ advance: 3, wait: 4 },                       { wait: 3, advance: 2, punch: 2, block: 1, kick: 1 },           { punch: 3, wait: 2, block: 2, kick: 1 }),
  speedrunner: W({ advance: 8, jump: 1 },                       { advance: 4, kick: 4, grab: 2, jump: 1 },                      { kick: 4, grab: 3, punch: 2 }),
  explorer:    W({ advance: 3, jump: 2, prop: 2, wait: 1 },     { punch: 2, kick: 2, jump: 2, prop: 2, grab: 1, sweep: 1 },     { punch: 2, kick: 2, grab: 2, jump: 1, prop: 1, sweep: 1, low_punch: 1 }),
};
const REACTIVITY = { turtle: 0.9, learner: 1, rusher: 0.3, masher: 0.1, cheeser: 0.4, casual: 0.3, speedrunner: 0.3, explorer: 0.5 };

function specificity(r) { return (r.dist ? 1 : 0) + (r.rival ? 1 : 0); }
function pick(w, rng) {
  let total = 0; for (const k in w) if (w[k] > 0) total += w[k];
  if (total <= 0) return 'wait';
  let x = rng() * total;
  for (const k in w) if (w[k] > 0 && (x -= w[k]) < 0) return k;
  return 'wait';
}

/** @param {object} persona  @param {number} seed  @returns {{step(sim): number, lastAction: string}} */
export function createPolicy(persona, seed) {
  const rng = mulberry32((seed ^ hashString(persona.id)) >>> 0);
  const react = (REACTIVITY[persona.archetype] ?? 0.5) * persona.skill;
  const rules = [...(persona.rules || [])].sort((a, b) => specificity(a) - specificity(b));
  let hold = 0, tap = 0, tapLeft = 0, nextDecide = 0, promptSig = '', pressAt = -1, pressKey = 0;
  const policy = { lastAction: 'wait', actions: {} };

  const reactionDelay = () => Math.max(3, Math.round(persona.reaction_ticks * 0.8 + rng() * persona.reaction_ticks * 0.5));

  function promptStep(sim, prompt) {
    const sig = `${prompt.phase}|${prompt.role}|${prompt.key}|${prompt.strikes ?? ''}`;
    if (sig !== promptSig) {
      promptSig = sig; pressKey = 0; pressAt = -1;
      if (prompt.phase === 'CONTEST') {
        const correct = 'Key' + prompt.key, ok = rng() < 0.35 + 0.65 * persona.skill;
        const wrong = ['KeyJ', 'KeyK', 'KeyL'].filter(k => k !== correct);
        pressKey = BIT[ok ? correct : wrong[Math.floor(rng() * wrong.length)]]; pressAt = sim.tick + reactionDelay();
      } else if (prompt.phase === 'CHOOSE' && prompt.role === 'ATTACKER') {
        const agg = ['rusher', 'masher', 'speedrunner'].includes(persona.archetype);
        const opts = prompt.choices.startsWith('J / K / F / L') || prompt.choices.startsWith('J / K / F') ? (agg ? ['KeyJ', 'KeyJ', 'KeyK', 'KeyF'] : ['KeyF', 'KeyF', 'KeyJ', 'KeyK']) : ['KeyF'];
        pressKey = BIT[opts[Math.floor(rng() * opts.length)]]; pressAt = sim.tick + reactionDelay();
      }
    }
    if (pressAt >= 0 && sim.tick >= pressAt) { tap = pressKey; tapLeft = 2; pressAt = -1; }
    if (tapLeft > 0) { tapLeft--; return tap; }
    return 0;
  }

  function decide(sim) {
    const o = sim.observe(), p = sim.player;
    let w = { ...BASE[persona.archetype]?.[o.bucket] ?? BASE.casual[o.bucket] };
    const rp = o.rivalPhase;
    if (rng() < react) {
      if ((rp === 'startup' || rp === 'active') && o.dist < 2.0) w = { block: 6, parry: 2 * persona.skill, retreat: 2 };
      else if (rp === 'recovery' && o.dist < 1.7) w = { kick: 4, punch: 4, sweep: persona.archetype === 'cheeser' ? 4 : 1 };
    }
    if (rp === 'down' && o.dist < 1.7 && rng() < 0.45 + 0.3 * persona.skill) w = { grab: 5, advance: 2 };
    if (p.carriedProp && rng() < 0.6) w = { punch: 1 }; // any attack key throws a carried prop
    for (const r of rules) if ((!r.dist || r.dist === o.bucket) && (!r.rival || r.rival === rp)) for (const k in r.weights) w[k] = r.weights[k];
    const action = pick(w, rng);
    policy.lastAction = action; policy.actions[action] = (policy.actions[action] || 0) + 1;
    const toward = p.facing > 0 ? BIT.KeyD : BIT.KeyA, away = p.facing > 0 ? BIT.KeyA : BIT.KeyD;
    hold = 0; tap = 0; tapLeft = 0;
    switch (action) {
      case 'advance': hold = toward; break;
      case 'retreat': hold = away; break;
      case 'block': hold = BIT.ShiftLeft; break;
      case 'punch': tap = BIT.KeyJ; break;
      case 'kick': tap = BIT.KeyK; break;
      case 'low_punch': hold = BIT.KeyS; tap = BIT.KeyJ; break;
      case 'sweep': hold = BIT.KeyS; tap = BIT.KeyK; break;
      case 'parry': tap = BIT.KeyL; break;
      case 'grab': tap = BIT.KeyF; break;
      case 'jump': tap = BIT.KeyW; break;
      case 'prop': tap = BIT.KeyE; break;
      default: break;
    }
    if (tap) tapLeft = 2;
    nextDecide = sim.tick + Math.max(4, Math.round(persona.reaction_ticks * (0.8 + rng() * 0.4)));
  }

  policy.step = sim => {
    const p = sim.player;
    if (p.mount || p.ground || p.grapple) {
      const prompt = getGrapplePrompt(p) || getGroundPrompt(p);
      hold = 0; nextDecide = Math.max(nextDecide, sim.tick + 6);
      return prompt ? promptStep(sim, prompt) : 0;
    }
    promptSig = '';
    if (['HIT_STUN', 'KNOCKDOWN', 'BEING_THROWN', 'GRABBED'].includes(p.state)) { hold = 0; tapLeft = 0; return 0; }
    if (sim.tick >= nextDecide) decide(sim);
    let m = hold;
    if (tapLeft > 0) { m |= tap; tapLeft--; }
    return m;
  };
  return policy;
}

// ---- synthetic personas (tests / fixtures only; the real 1000 are written by Nemotron Nano via ai/) ----
export const ARCH = ['turtle', 'rusher', 'masher', 'learner', 'cheeser', 'casual', 'speedrunner', 'explorer'];
export function syntheticPersona(i) {
  const r = mulberry32(1000 + i);
  return { id: 'p' + String(i).padStart(4, '0'), name: 'Synth' + i, archetype: ARCH[i % ARCH.length], skill: +(0.2 + r() * 0.75).toFixed(2), reaction_ticks: 8 + Math.floor(r() * 28), patience: +r().toFixed(2), frustration_tolerance: +r().toFixed(2), bio: 'synthetic test persona', rules: [] };
}
