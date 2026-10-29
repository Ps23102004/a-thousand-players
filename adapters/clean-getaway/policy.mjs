// Persona -> actions for Clean Getaway. Same skeleton as engine/policy.mjs (archetype weights, weighted
// pick, decision cadence from reaction_ticks, skill = how often the "right" move is chosen), but the game's
// moves are typed actions with arguments, so "the right move" comes from the game's own bot (bots.decide)
// and the archetype decides how the persona deviates from it. Persona `rules` (Market Brawl) are ignored.
import { decide, scenarioOf, CHASE } from './sim.mjs';
import { mulberry32, hashString, pick } from '../lib/common.mjs';

// What each archetype does when it is not playing the bot's line.
export const BASE = {
  turtle:      { wait: 6, idle: 4, explore: 1 },
  rusher:      { rush: 6, explore: 2, wild: 1 },
  masher:      { wild: 6, explore: 2, rush: 1 },
  learner:     { explore: 4, wait: 3, wild: 1 },
  cheeser:     { exploit: 6, wild: 2, rush: 1 },
  casual:      { chat: 3, wait: 3, idle: 3, explore: 1 },
  speedrunner: { rush: 7, exploit: 2 },
  explorer:    { explore: 7, wild: 2 },
};

const KINDS = ['chooseTools', 'move', 'unlock', 'readCode', 'openVault', 'takeLoot', 'plant', 'wipe', 'disableCamera', 'leave', 'chat', 'backup',
  'search', 'reviewFootage', 'test', 'interview', 'mark', 'tip', 'wait', 'accuse', 'surrender', 'run', 'chaseMove', 'presentClue', 'claim', 'object', 'verdict', 'clientTell'];
const TOOLS = ['gloves', 'mask', 'lockpick', 'crowbar', 'bleach', 'jammer'];
const COATS = ['red', 'black', 'green', 'blue', 'beige', 'grey'];

/** A well-formed action of a random kind with arguments drawn from the live state (fuzzing the rules, not JSON). */
export function randomAction(s, rng, garbage = false) {
  const sc = scenarioOf(s.scenarioId), any = xs => xs[Math.floor(rng() * xs.length)];
  const zone = () => garbage && rng() < 0.3 ? any(['', 'nowhere', '__proto__', 'x'.repeat(300)]) : any(sc.zones).id;
  const suspects = s.case?.suspects.map(x => x.id) ?? ['s1'];
  const clue = () => (s.clues.length && rng() < 0.8 ? any(s.clues).id : garbage ? any(['', 'c-999', '../x']) : 'c1');
  const cell = () => garbage && rng() < 0.3 ? [Math.floor(rng() * 20) - 5, Math.floor(rng() * 20) - 5] : [Math.floor(rng() * CHASE.size), Math.floor(rng() * CHASE.size)];
  const kind = any(KINDS);
  switch (kind) {
    case 'chooseTools': return { kind, tools: Array.from({ length: Math.floor(rng() * (garbage ? 7 : 3)) }, () => any(TOOLS)), frame: rng() < 0.5 ? any(suspects) : null };
    case 'move': return { kind, to: zone() };
    case 'unlock': return { kind, door: sc.doors.length ? any(sc.doors).id : 'd', method: any(['lockpick', 'crowbar']) };
    case 'openVault': return { kind, code: rng() < 0.2 ? (s.case?.vaultCode ?? '0000') : String(Math.floor(rng() * 10000)).padStart(4, '0') };
    case 'disableCamera': return { kind, camera: sc.cameras.length ? any(sc.cameras).id : 'cam' };
    case 'chat': case 'claim': case 'clientTell': return { kind, [kind === 'chat' ? 'text' : 'claim']: garbage ? any(['', 'x'.repeat(5000), '<script>', '\u0000']) : 'I was at home' };
    case 'test': case 'presentClue': case 'object': return { kind, clue: clue() };
    case 'interview': return { kind, suspect: any(suspects) };
    case 'mark': return { kind, suspect: any(suspects), crossed: rng() < 0.5 };
    case 'tip': return { kind, coat: any(COATS), zone: zone() };
    case 'accuse': return { kind, suspects: garbage && rng() < 0.3 ? [...suspects, ...suspects] : suspects.filter(() => rng() < 0.4) };
    case 'chaseMove': return { kind, to: cell() };
    case 'verdict': return { kind, guilty: rng() < 0.5 };
    default: return { kind };
  }
}

export function createPolicy(persona, seed) {
  const rng = mulberry32((seed ^ hashString(persona.id)) >>> 0);
  const skill = persona.skill ?? 0.5, msPerTick = 1000 / 60;
  let nextAt = 0;
  const policy = { lastAction: 'wait', actions: {} };
  policy.step = sim => {
    const now = sim.now();
    if (now < nextAt) return null;
    nextAt = now + Math.max(250, persona.reaction_ticks * msPerTick * (2 + rng() * 4)); // humans act every ~1-4 s here
    const s = sim.state();
    const bot = decide(s, sim.seat, now);
    let style = rng() < 0.25 + 0.7 * skill ? 'bot' : pick(BASE[persona.archetype] ?? BASE.casual, rng);
    policy.lastAction = style; policy.actions[style] = (policy.actions[style] || 0) + 1;
    switch (style) {
      case 'bot': return bot;
      case 'idle': return null;
      case 'wait': return { kind: 'wait' };
      case 'chat': return { kind: 'chat', text: 'anyone see anything?' };
      case 'rush': return pick({ leave: 2, run: 2, accuse: 1, verdict: 1, bot: 3 }, rng) === 'bot' ? bot : randomActionOfKind(s, rng);
      case 'explore': { const a = randomAction(s, rng); return a.kind === 'move' || a.kind === 'search' || a.kind === 'interview' ? a : { kind: 'move', to: pick(Object.fromEntries(scenarioOf(s.scenarioId).zones.map(z => [z.id, 1])), rng) }; }
      case 'exploit': return randomAction(s, rng, true);
      default: return randomAction(s, rng);
    }
  };
  function randomActionOfKind(s, r) {
    const k = pick({ leave: 1, run: 1, surrender: 1, verdict: 1, accuse: 1 }, r);
    return k === 'accuse' ? { kind: k, suspects: (s.case?.suspects ?? []).slice(0, 1).map(x => x.id) } : k === 'verdict' ? { kind: k, guilty: true } : { kind: k };
  }
  return policy;
}

/** Random-input fuzzer: an action of any kind, garbage arguments included, every 1-8 steps. */
export function createFuzzer(seed) {
  const rng = mulberry32(seed ^ 0xf00d);
  let nextTick = 0;
  return { lastAction: 'fuzz', step(sim) { if (sim.tick < nextTick) return null; nextTick = sim.tick + 1 + Math.floor(rng() * 8); return randomAction(sim.state(), rng, rng() < 0.5); } };
}
