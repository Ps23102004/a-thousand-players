// Headless Clean Getaway (9-seat heist -> investigation -> arrest/chase -> trial) adapter. Drives the game's
// own pure engine (~/Developer/clean-getaway/src/engine, referenced by path: that repo has no LICENSE file,
// so nothing is copied). One seat is the crowd player; the other eight are the game's own bots.
//   createSim({ seed, scenario, stepMs }) -> { step(action|null), observe(), done, outcome, events, hash(), result() }
// Input is an Action object (or null = idle), not a key mask: this game has no keys, only legal moves.
// Needs a TS loader: node --import tsx ...
import { floatHasher, mulberry32 } from '../lib/common.mjs';

export const ENGINE = process.env.CLEAN_GETAWAY_ENGINE || new URL('../../../clean-getaway/src/engine/', import.meta.url).href;
const { createGame, startGame, act, tick } = await import(ENGINE + 'game.ts');
const { RuleError } = await import(ENGINE + 'errors.ts');
const { parseAction } = await import(ENGINE + 'parse.ts'); // the server's own input validation (server/handler.ts)
const { scenarioOf, SCENARIOS } = await import(ENGINE + 'scenarios.ts');
const { viewFor } = await import(ENGINE + 'views.ts');
const { decide } = await import(ENGINE + 'bots.ts');
const { CHASE } = await import(ENGINE + 'rules.ts');
export { decide, scenarioOf, SCENARIOS, CHASE };

export const STEP_MS = 250; // fixed time step: the engine is event-timed, so this is only the sampling rate
const MAX_MS = 45 * 60_000; // a single case should close far sooner; past this it is a softlock

/** Run fn with crypto.randomUUID seeded (the engine's only nondeterminism: player ids and tokens). */
function seeded(rng, fn) {
  const c = globalThis.crypto, orig = c.randomUUID;
  c.randomUUID = () => { const h = n => Math.floor(rng() * 16 ** n).toString(16).padStart(n, '0'); return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`; };
  try { return fn(); } finally { c.randomUUID = orig; }
}

export function createSim(opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0, stepMs = opts.stepMs ?? STEP_MS;
  const ids = mulberry32(seed ^ 0x5eed);
  const scenario = opts.scenario || Object.keys(SCENARIOS)[seed % Object.keys(SCENARIOS).length];
  const sc = scenarioOf(scenario), zones = new Set(sc.zones.map(z => z.id));
  let now = 0, state;
  seeded(ids, () => {
    const g = createGame('SIMU', 'Crowd', seed, 0);
    state = startGame(g.state, g.state.hostId, scenario, 0, 1);
  });
  const me = state.players.find(p => p.id === state.hostId);
  const H = floatHasher();
  const sim = { seed, scenario, seat: me.seat, playerId: me.id, tick: 0, done: false, outcome: null, events: [], inputs: [], rejected: {}, accepted: 0 };
  const inv = { phase: state.phase.name, phaseSince: 0, flagged: new Set() };
  const t = () => Math.round(now / 100) / 10;
  const push = (code, arg) => { if (sim.events.length < 200) sim.events.push(arg === undefined ? [t(), code] : [t(), code, arg]); };
  const once = (code, arg) => { const k = code + ':' + arg; if (!inv.flagged.has(k)) { inv.flagged.add(k); push(code, arg); } };
  const end = out => { sim.done = true; sim.outcome = out; push('end', out); };

  function scanNumbers(o, path, depth = 0) {
    if (depth > 6 || o === null) return;
    if (typeof o === 'number') { if (!Number.isFinite(o)) once('nan', path); return; }
    if (typeof o !== 'object') return;
    for (const k in o) scanNumbers(o[k], path + '.' + k, depth + 1);
  }
  // Invariants: things that must hold in any legal game state, whoever is playing.
  function checks() {
    const s = state;
    scanNumbers({ players: s.players, actors: s.actors, phase: s.phase, chase: s.chase, clues: s.clues }, 's');
    for (const a of s.actors) if (!zones.has(a.zone)) once('oob', `${a.seat}@${a.zone}`);
    if (s.chase) for (const c of [s.chase.fugitive, ...Object.values(s.chase.cops)]) if (c.some(v => v < 0 || v >= CHASE.size || !Number.isInteger(v))) once('oob', `chase-cell ${c}`);
    const seats = s.players.map(p => p.seat).filter(Boolean);
    if (new Set(seats).size !== seats.length) once('dup-seat', seats.join(','));
    // Actor walking but frozen: busy label set for over a minute past its own deadline.
    for (const a of s.actors) if (a.inScene && !a.left && a.moveEnd > now + 120_000) once('stuck', `${a.seat} move ends +${Math.round((a.moveEnd - now) / 1000)}s`);
    if (s.phase.name !== inv.phase) { inv.phase = s.phase.name; inv.phaseSince = now; push('phase', s.phase.name); }
    if (s.phase.end !== null && now > s.phase.end + 5_000) once('softlock', `${s.phase.name} overdue`);
    if (s.phase.end === null && s.phase.name !== 'closed') once('softlock', `${s.phase.name} has no deadline`);
    if (s.phase.name === 'closed') {
      if (!s.outcome) once('bad-outcome', 'closed without outcome');
      return end('closed');
    }
    if (now > MAX_MS) { once('softlock', `never closed (${s.phase.name})`); end('softlock'); }
  }

  sim.step = action => {
    if (sim.done) return true;
    if (action) {
      sim.inputs.push([sim.tick, action]);
      try { state = seeded(ids, () => act(state, sim.seat, parseAction(action), now)); sim.accepted++; }
      catch (e) {
        if (e instanceof RuleError) sim.rejected[e.code] = (sim.rejected[e.code] || 0) + 1;
        else { push('crash', `act ${action.kind}: ${String(e?.message || e).slice(0, 60)}`); return end('crash'), true; }
      }
    }
    now += stepMs; sim.tick++;
    try { state = seeded(ids, () => tick(state, now)); }
    catch (e) { push('crash', `tick: ${String(e?.message || e).slice(0, 60)}`); return end('crash'), true; }
    H.add(state.version); H.add(now); H.addString(state.phase.name);
    for (const p of state.players) H.add(p.score);
    for (const a of state.actors) { H.addString(a.zone); H.add(a.busyUntil); }
    if (sim.tick % 4 === 0 || state.phase.name === 'closed') checks();
    return sim.done;
  };
  sim.hash = () => H.hex() + sim.tick.toString(16);
  sim.time = () => now / 1000;
  sim.now = () => now;
  sim.state = () => state;
  /** What the crowd player is allowed to see: the game's own per-seat view (same as a human's client). */
  sim.observe = () => viewFor(state, sim.playerId, now);
  sim.result = () => {
    const o = state.outcome;
    return { out: sim.outcome || 'timeout', t: t(), seat: sim.seat, scenario, ev: sim.events, hash: sim.hash(), inputs: sim.inputs, accepted: sim.accepted, rejected: sim.rejected,
      score: state.players.find(p => p.id === sim.playerId)?.score ?? null, headline: o?.headline ?? null };
  };
  sim.dispose = () => {};
  return sim;
}

/** Replay recorded inputs ([tick, action][]) exactly. */
export function inputController(inputs) {
  let i = 0;
  return { step(sim) { let a = null; while (i < inputs.length && inputs[i][0] <= sim.tick) a = inputs[i++][1]; return a; } };
}

export function runRound(sim, controller) {
  while (!sim.done) sim.step(controller.step(sim));
  return sim.result();
}
