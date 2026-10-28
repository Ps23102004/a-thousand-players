// Deterministic headless (or rendered) match of Market Brawl.
// (seed, tuning, controller) -> identical match. See docs/design.md "Determinism contract".
//
// Isomorphic: the same file drives 1000-player crowd runs in Node and the real 3D replay in the browser
// (pass `scene` to render into). Game logic runs under a seeded Math.random and a simulated performance.now;
// both are swapped in only while logic executes. ONE sim per JS realm at a time: the game modules keep
// module-level state (key map, rival memory, hit-stop), so parallelism is by worker, not by interleaving.
import * as THREE from 'three';
import { initPhysics, stepPhysics } from '../game/src/physics.js';
import { createFighterRig } from '../game/src/character.js';
import { createArenaColliders } from '../game/src/world.js';
import { createCardboardBox, updateProps } from '../game/src/props.js';
import { ANIMATIONS, updateAnimation } from '../game/src/animation.js';
import { checkHitCollisions, resolveDamageAndImpulse, updateHitStop } from '../game/src/combat.js';
import { initPlayerControls, updatePlayer, clearInputKeys } from '../game/src/player.js';
import { updateRivalAI, resetRivalAI } from '../game/src/ai.js';
import { updateGround, updateMount } from '../game/src/ground.js';
import { updateGrapple } from '../game/src/grapple.js';
import { RULES, RULE_DEFAULTS } from '../game/src/tuning.js';

// player.js listens for keys on `window`. A permanent global `window` in Node makes Rapier's wasm glue take its
// browser path and trap ("unreachable"), so the stub exists only while player.js registers/unregisters listeners.
const NODE = typeof window === 'undefined';
const withWindow = (target, fn) => { if (!NODE) return fn(); globalThis.window = target; try { return fn(); } finally { delete globalThis.window; } };
// EventTarget.dispatchEvent swallows listener exceptions; this one rethrows them so a crash is attributed to its real cause.
class KeyTarget {
  l = {};
  addEventListener(type, fn) { (this.l[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.l[type] = (this.l[type] || []).filter(f => f !== fn); }
  dispatch(e) { for (const fn of this.l[e.type] || []) fn(e); }
}

export const DT = 1 / 60;
export const ROUND_TICKS = 99 * 60;
export const COUNTDOWN_TICKS = 120;
// Modifier/movement keys first so a same-tick "crouch + J" sees crouch before the attack key.
export const KEYS = ['KeyA', 'KeyD', 'KeyS', 'KeyW', 'ShiftLeft', 'KeyQ', 'KeyV', 'KeyJ', 'KeyK', 'KeyL', 'KeyF', 'KeyE'];
export const BIT = Object.fromEntries(KEYS.map((k, i) => [k, 1 << i]));
export const STATES = ['IDLE', 'STARTUP', 'ACTIVE', 'RECOVERY', 'BLOCK', 'PARRY', 'HIT_STUN', 'KNOCKDOWN', 'BEING_THROWN', 'GRAB', 'GRABBED', 'CROUCH', 'MOUNT', 'PINNED', 'DOWNED', 'GETUP', 'CARRY_PROP'];
const STUCK_STATES = new Set(['STARTUP', 'ACTIVE', 'RECOVERY', 'HIT_STUN', 'KNOCKDOWN', 'BEING_THROWN', 'GRAB', 'GRABBED', 'MOUNT', 'PINNED', 'DOWNED', 'GETUP']);

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------------------------------------------------------- tuning
const BASE_ANIM = {};
for (const [name, a] of Object.entries(ANIMATIONS)) {
  if (a.type !== 'attack') continue;
  BASE_ANIM[name] = { damage: a.damage, startup: a.startup, active: a.active, recovery: a.recovery, duration: a.duration, hitStop: a.hitStop, reach: a.reach, drive: a.drive, kf: a.keyframes.map(k => k.t) };
}
/** Absolute overrides keyed like data/baseline-tuning.json. null/{} restores the shipped game. */
export function applyTuning(tuning) {
  for (const [name, b] of Object.entries(BASE_ANIM)) {
    const a = ANIMATIONS[name];
    for (const f of ['damage', 'startup', 'active', 'recovery', 'duration', 'hitStop', 'reach', 'drive']) a[f] = b[f];
    a.keyframes.forEach((k, i) => { k.t = b.kf[i]; });
  }
  Object.assign(RULES, RULE_DEFAULTS);
  for (const [key, v] of Object.entries(tuning || {})) {
    const m = /^anim\.([A-Z_]+)\.(\w+)$/.exec(key);
    if (m) {
      const a = ANIMATIONS[m[1]], b = BASE_ANIM[m[1]]; if (!a || !b) continue;
      if (m[2] === 'recovery') { // recovery == clip duration; keep keyframes proportional
        a.recovery = a.duration = v; a.keyframes.forEach((k, i) => { k.t = b.kf[i] * v / b.duration; });
      } else a[m[2]] = v;
    } else if (key.startsWith('rules.')) RULES[key.slice(6)] = v;
    else if (key === 'rival.decisionDelayMin') RULES.decisionDelayMin = v;
  }
}

// ---------------------------------------------------------------- helpers
const h64 = new Float64Array(8), h32 = new Uint32Array(h64.buffer);
const r2 = x => Math.round(x * 100) / 100;
function phaseOf(f) {
  if (f.ground || f.mount) return 'down';
  switch (f.state) {
    case 'STARTUP': return 'startup'; case 'ACTIVE': return 'active'; case 'RECOVERY': return 'recovery';
    case 'KNOCKDOWN': case 'BEING_THROWN': case 'PINNED': case 'DOWNED': return 'down';
    case 'HIT_STUN': case 'GRABBED': return 'stunned'; default: return 'idle';
  }
}
export function distBucket(d) { return d > 2.2 ? 'far' : d >= 1.3 ? 'mid' : 'close'; }

// ---------------------------------------------------------------- the sim
/** opts: {seed, tuning, fighter:'kai'|'rook', maxT (sec, default 99), trace:boolean, scene?:THREE.Scene} */
export async function createSim(opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0, fighterName = opts.fighter || 'kai';
  const maxTicks = Math.min(ROUND_TICKS, Math.round((opts.maxT ?? 99) * 60));
  applyTuning(opts.tuning);
  const sim = { seed, tick: 0, pre: 0, done: false, outcome: null, events: [], inputs: [], held: 0, ko: null };
  const rng = mulberry32(seed), now = () => 1e6 + (sim.pre + sim.tick) * (1000 / 60); // monotonic: Rapier's profiler also reads performance.now
  const withSim = fn => {
    const r = Math.random, p = performance.now;
    Math.random = rng; performance.now = now;
    try { return fn(); } finally { Math.random = r; performance.now = p; }
  };
  const physics = await initPhysics();
  const world = sim.world = physics.world, scene = sim.scene = opts.scene || new THREE.Scene();
  let cleanup = () => {};
  const keyTarget = NODE ? new KeyTarget() : window;
  const combo = { count: 0, timer: 0, max: 0 };
  let h1 = 2166136261, h2 = 5381;
  const trace = opts.trace ? [] : null;
  const inv = { stateSince: [0, 0], lastState: ['', ''], airSince: [-1, -1], oob: [false, false], clipSince: -1, clipped: false, quietSince: 0, soft: false, stuckFlagged: [false, false] };

  const t = () => r2(sim.tick * DT);
  const push = (code, who, arg) => { if (sim.events.length < 220) sim.events.push(arg === undefined ? [t(), code, who] : [t(), code, who, arg]); };

  withSim(() => {
    createArenaColliders(world);
    sim.player = createFighterRig(scene, world, true, -1.0, fighterName);
    sim.rival = createFighterRig(scene, world, false, 1.0, fighterName === 'kai' ? 'rook' : 'kai');
    sim.props = [createCardboardBox(scene, world, -7.5, 0.4), createCardboardBox(scene, world, 7.5, 0.4)];
    sim.player.inputEnabled = false;
    const off = withWindow(keyTarget, () => initPlayerControls(sim.player));
    cleanup = () => withWindow(keyTarget, off);
    updateHitStop(1); resetRivalAI(); clearInputKeys();
  });
  const { player, rival } = sim;
  const who = f => (f === player ? 0 : 1);
  const comboHit = () => { combo.count++; combo.timer = 2; if (combo.count > combo.max) combo.max = combo.count; if (combo.count >= 3) push('combo', 0, combo.count); };
  player.onThrow = () => comboHit();
  for (const f of [player, rival]) {
    f.onGroundEvent = ev => {
      if (ev.type === 'knockdown') push('knockdown', who(ev.defender));
      else if (ev.type === 'mount') push('mount', who(ev.actor));
      else if (ev.type === 'ground-strike') { push('hit', who(ev.actor), 'GROUND'); if (ev.actor === player) comboHit(); }
    };
  }
  player.onGrappleEvent = rival.onGrappleEvent = ev => {
    if (ev.type === 'throw') push('throw', who(ev.actor));
    else if (ev.type === 'reversal') push('throw', who(ev.actor), 'reversal');
    else if (ev.type === 'strike') { push('hit', who(ev.actor), ev.action); if (ev.actor === player) comboHit(); }
  };

  // Countdown: fighters drop onto the floor with inputs disabled (mirrors GameApp.updateFight).
  withSim(() => { for (let i = 0; i < COUNTDOWN_TICKS; i++) { stepPhysics(DT); player.updatePhysics(DT); rival.updatePhysics(DT); updateAnimation(player, DT); updateAnimation(rival, DT); sim.pre++; } });
  player.inputEnabled = true;

  const fire = (type, code) => {
    if (NODE) { keyTarget.dispatch({ type, code, repeat: false, controllerInput: false, preventDefault() {} }); return; }
    const e = new Event(type); e.code = code; e.repeat = false; e.controllerInput = false; keyTarget.dispatchEvent(e);
  };
  sim.setHeld = mask => {
    if (mask === sim.held) return;
    const changed = mask ^ sim.held; sim.inputs.push([sim.tick, mask]);
    withSim(() => {
      for (let i = 0; i < KEYS.length; i++) if ((changed >> i & 1) && !(mask >> i & 1)) fire('keyup', KEYS[i]);
      for (let i = 0; i < KEYS.length; i++) if ((changed >> i & 1) && (mask >> i & 1)) fire('keydown', KEYS[i]);
    });
    sim.held = mask;
  };

  const end = outcome => { sim.done = true; sim.outcome = outcome; };
  function resolveHits(attacker, defender) {
    for (const hit of checkHitCollisions(attacker, defender, sim.props)) {
      const res = resolveDamageAndImpulse(hit); if (!res) continue;
      const a = who(attacker);
      if (hit.type === 'fighter') {
        if (res.parried) push('parry', who(defender));
        else if (res.blocked) push('block', who(defender));
        else { push('hit', a, attacker.currentAnim); if (attacker === player) comboHit(); }
      } else if (res.propShattered) push('prop', a);
    }
  }
  function checks() {
    const ps = [player, rival], tt = sim.tick * DT;
    for (let i = 0; i < 2; i++) {
      const f = ps[i], p = f.rigidBody.translation();
      if (!Number.isFinite(p.x + p.y + p.z + f.health)) { push('nan', i); end('draw'); return; }
      if (!inv.oob[i] && (Math.abs(p.x) > 10.45 || p.y < -0.6 || Math.abs(p.z) > 2.3)) { inv.oob[i] = true; push('oob', i, r2(p.x)); }
      if (p.y > 1.3) { if (inv.airSince[i] < 0) inv.airSince[i] = tt; else if (tt - inv.airSince[i] > 2.5) { push('airborne', i); inv.airSince[i] = tt + 99; } } else inv.airSince[i] = -1;
      if (f.state !== inv.lastState[i]) { inv.lastState[i] = f.state; inv.stateSince[i] = tt; inv.stuckFlagged[i] = false; }
      else if (!inv.stuckFlagged[i] && STUCK_STATES.has(f.state) && tt - inv.stateSince[i] > 10) { inv.stuckFlagged[i] = true; push('stuck', i, f.state); }
    }
    const a = player.rigidBody.translation(), b = rival.rigidBody.translation();
    if (Math.abs(a.x - b.x) < 0.12 && Math.hypot(a.z - b.z) < 0.4 && !player.mount && !rival.mount && !player.grapple) { if (inv.clipSince < 0) inv.clipSince = tt; else if (!inv.clipped && tt - inv.clipSince > 2) { inv.clipped = true; push('clip', 0); } } else inv.clipSince = -1;
    if (player.health + rival.health !== inv.lastHpSum) { inv.lastHpSum = player.health + rival.health; inv.quietSince = tt; inv.soft = false; }
    else if (!inv.soft && tt - inv.quietSince > 25) { inv.soft = true; push('softlock', 0, 'stalemate'); }
  }

  /** Advance one fight tick (60 Hz). Caller sets keys with setHeld() first. */
  sim.tick1 = () => {
    if (sim.done) return true;
    withSim(() => {
      for (const f of [player, rival]) f.grappleCooldown = Math.max(0, (f.grappleCooldown || 0) - DT);
      updateGrapple(player.grapple || rival.grapple, DT);
      updateMount(player.mount || rival.mount, DT);
      updateGround(player, DT); updateGround(rival, DT);
      updateHitStop(DT); updatePlayer(player, rival, sim.props, DT);
      if (opts.rivalAI !== false) updateRivalAI(rival, player, sim.props, DT);
      stepPhysics(DT);
      for (const f of [player, rival]) { f.updatePhysics(DT); updateAnimation(f, DT); }
      resolveHits(player, rival); resolveHits(rival, player);
      updateProps(sim.props, DT, [player, rival]);
    });
    sim.tick++;
    if (combo.timer > 0) { combo.timer -= DT; if (combo.timer <= 0) combo.count = 0; }
    const pa = player.rigidBody.translation(), pb = rival.rigidBody.translation();
    for (const v of [pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, player.health, rival.health]) { h64[0] = v; h1 = Math.imul(h1 ^ h32[0], 16777619); h1 = Math.imul(h1 ^ h32[1], 16777619); h2 = (Math.imul(h2, 33) ^ h32[0] ^ h32[1]) | 0; }
    if (trace && sim.tick % 6 === 0) trace.push([r2(pa.x), r2(pb.x), Math.round(player.health), Math.round(rival.health), Math.max(0, STATES.indexOf(player.state)), Math.max(0, STATES.indexOf(rival.state))]);
    if (sim.tick % 6 === 0) checks();
    if (!sim.done) {
      if (rival.health <= 0) { sim.ko = { x: r2(pb.x), t: t() }; end('win'); }
      else if (player.health <= 0) { sim.ko = { x: r2(pa.x), t: t() }; end('loss'); }
      else if (sim.tick >= maxTicks) end(player.health > rival.health ? 'win' : player.health < rival.health ? 'loss' : 'draw');
    }
    return sim.done;
  };
  sim.step = mask => { sim.setHeld(mask); return sim.tick1(); };
  sim.hash = () => (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + sim.tick.toString(16);
  sim.time = () => sim.tick * DT;
  sim.observe = () => {
    const fo = f => { const p = f.rigidBody.translation(); return { hp: f.health, posture: Math.round(f.posture), x: r2(p.x), state: f.state, facing: f.facing, guarding: !!f.isGuarding, grappled: !!(f.grapple || f.mount), onGround: !!f.ground }; };
    const a = player.rigidBody.translation(), b = rival.rigidBody.translation(), dist = Math.hypot(a.x - b.x, a.z - b.z);
    return { t: r2(sim.time()), me: fo(player), rival: fo(rival), dist: r2(dist), bucket: distBucket(dist), rivalPhase: phaseOf(rival), mePhase: phaseOf(player) };
  };
  sim.result = () => ({
    out: sim.outcome || 'draw', t: r2(sim.time()), hp: [Math.round(player.health * 10) / 10, Math.round(rival.health * 10) / 10], ko: sim.ko, ev: sim.events,
    dmg: [Math.round((100 - rival.health) * 10) / 10, Math.round((100 - player.health) * 10) / 10], maxCombo: combo.max, hash: sim.hash(), inputs: sim.inputs,
    trace: trace ? { states: STATES, dt: 0.1, f: trace, ev: sim.events } : null,
  });
  sim.dispose = () => { cleanup(); clearInputKeys(); world.free(); applyTuning(null); };
  return sim;
}

/** Run a full round. controller.step(sim) -> key bitmask (may return a Promise for live LLM players). */
export async function runRound(sim, controller) {
  try {
    while (!sim.done) {
      let mask = controller.step(sim);
      if (mask && typeof mask.then === 'function') mask = await mask;
      sim.step(mask | 0);
    }
  } catch (e) {
    // A game exception (e.g. a Rapier WASM trap) is itself a finding. The physics world may be poisoned
    // afterwards, so callers must not reuse or dispose this sim's world (check sim.crashed).
    const m = /at (\S+) \([^)]*?game\/src\/([\w.]+:\d+)/.exec(e?.stack || '');
    sim.crashed = `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 40)}${m ? ` in ${m[1]} (${m[2]})` : ''}`;
    sim.events.push([r2(sim.time()), 'crash', 0, sim.crashed]);
    sim.done = true; sim.outcome = 'draw';
  }
  return sim.result();
}

/** Replay recorded inputs ([tick, mask][]) exactly. */
export function inputController(inputs) {
  let i = 0, mask = 0;
  return { step(sim) { while (i < inputs.length && inputs[i][0] <= sim.tick) mask = inputs[i++][1]; return mask; } };
}
