// Headless Homeground (longboard downhill) adapter. Runs the game's own Board + WorldCollider (vendored,
// MIT, three.js-free) on a seeded synthetic tile, since real tiles come from live map data over the network.
//   createSim({ seed, maxT }) -> { tick(mask, n), observe(), done, outcome, events, hash(), result() }
// Needs a TS loader: node --import tsx ...
import { Board } from './vendor/game/board.ts';
import { WorldCollider } from './vendor/game/collider.ts';
import { TUNING } from './vendor/game/tuning.ts';
import { mulberry32, floatHasher } from '../lib/common.mjs';

export const DT = 1 / 60;
export const HALF = 500; // tile half-size in meters, as in the game's own physics test
// Input mask bits. Steer is digital here (keyboard), as in the game's Controls.
export const KEYS = ['left', 'right', 'throttle', 'brake', 'tuck'];
export const BIT = Object.fromEntries(KEYS.map((k, i) => [k, 1 << i]));

const r2 = n => Math.round(n * 100) / 100;

/** Seeded level: a downhill along +X with rolling bumps, one road down the fall line, a side street,
 *  a kicker ramp, and box buildings, some of them close to the road. Same shape as the game's test tiles. */
export function makeLevel(seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const grade = 0.04 + rng() * 0.08, a1 = 2 + rng() * 4, k1 = 0.01 + rng() * 0.02, a2 = 1 + rng() * 2, k2 = 0.02 + rng() * 0.03;
  const rampX = -100 + rng() * 300, rampH = 1.5 + rng() * 2.5;
  const h = (x, z) => -grade * x + a1 * Math.sin(k1 * x + 1.3) * Math.cos(k2 * z) + a2 * Math.sin(k2 * z + k1 * x)
    + rampH * Math.max(0, 1 - Math.abs(x - rampX) / 6) * (x < rampX ? 1 : 0); // a kicker that ends in a drop
  const spacing = 5, n = (HALF * 2) / spacing + 1, elevations = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) elevations[j * n + i] = h(-HALF + i * spacing, -HALF + j * spacing);
  const roadZ = (rng() - 0.5) * 40, crossX = -200 + rng() * 400;
  const road = (cl, w) => ({ centerline: cl, widthMeters: w, tag: 'residential', osmTags: {} });
  const roads = [road([{ x: -HALF, z: roadZ }, { x: HALF, z: roadZ }], 10 + rng() * 6), road([{ x: crossX, z: -HALF }, { x: crossX, z: HALF }], 8)];
  const buildings = [];
  for (let i = 0; i < 40; i++) {
    const x = -HALF + 20 + rng() * (HALF * 2 - 40), side = rng() < 0.5 ? -1 : 1;
    const z = roadZ + side * (9 + rng() * 60), w = 6 + rng() * 14, d = 6 + rng() * 14;
    if (Math.abs(x - crossX) < 12 || Math.abs(x - rampX) < 15) continue;
    buildings.push({ footprint: [{ x, z }, { x: x + w, z }, { x: x + w, z: z + side * d }, { x, z: z + side * d }], height: 6 + rng() * 10, tag: 'residential', osmTags: {} });
  }
  const tile = { origin: { lat: 0, lon: 0 }, radiusMeters: HALF, terrain: { width: n, depth: n, spacing, originX: -HALF, originZ: -HALF, elevations }, buildings, roads, generatedAt: new Date(0).toISOString() };
  return { tile, roadZ, crossX, rampX, spawn: { x: -HALF + 60, z: roadZ, yaw: 0 }, finishX: HALF - 30 };
}

function insideBox(b, x, z) {
  const xs = b.footprint.map(p => p.x), zs = b.footprint.map(p => p.z);
  return x > Math.min(...xs) + 0.05 && x < Math.max(...xs) - 0.05 && z > Math.min(...zs) + 0.05 && z < Math.max(...zs) - 0.05;
}

export function createSim(opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0, maxTicks = Math.round((opts.maxT ?? 60) * 60);
  const level = opts.level || makeLevel(seed);
  const collider = new WorldCollider(level.tile), board = new Board(collider);
  board.reset(level.spawn.x, level.spawn.z, level.spawn.yaw);
  const H = floatHasher();
  const sim = { seed, tick: 0, done: false, outcome: null, events: [], inputs: [], level, board, collider, held: 0 };
  const inv = { slowSince: -1, bailSince: -1, airSince: -1, lastX: board.pos.x, lastZ: board.pos.z, progressAt: 0, flagged: new Set() };
  let prevThrottle = false, maxX = board.pos.x;
  const t = () => r2(sim.tick * DT);
  const push = (code, arg) => { if (sim.events.length < 200) sim.events.push(arg === undefined ? [t(), code] : [t(), code, arg]); };
  const once = (code, arg) => { if (!inv.flagged.has(code)) { inv.flagged.add(code); push(code, arg); } };
  const end = out => { sim.done = true; sim.outcome = out; push('end', out); };

  // Invariants, checked every 6 frames like engine/sim.mjs.
  function checks(mask) {
    const b = board, p = b.pos, v = b.vel;
    if (![p.x, p.y, p.z, v.x, v.y, v.z, b.yaw].every(Number.isFinite)) { push('nan'); return end('crash'); }
    const gy = collider.heightAt(p.x, p.z);
    if (p.y < gy - 0.75) once('clip', r2(gy - p.y)); // fell through the heightfield
    if (Math.abs(p.x) > HALF || Math.abs(p.z) > HALF) { push('oob', `${r2(p.x)},${r2(p.z)}`); return end('oob'); }
    for (const bd of level.tile.buildings) if (p.y < bd.height + gy && insideBox(bd, p.x, p.z)) { once('tunnel', `${r2(p.x)},${r2(p.z)}`); break; }
    if (b.speed > TUNING.maxSpeed + 0.5) once('overspeed', r2(b.speed));
    // stuck: holding push/pump, not bailing, yet barely moving for 4 s (wedged on a wall or a flat).
    if ((mask & BIT.throttle) && b.bailTimer <= 0 && b.groundSpeed < 0.3) { if (inv.slowSince < 0) inv.slowSince = sim.tick; else if (sim.tick - inv.slowSince > 240) once('stuck', `${r2(p.x)},${r2(p.z)}`); }
    else inv.slowSince = -1;
    if (b.bailTimer > 0) { if (inv.bailSince < 0) inv.bailSince = sim.tick; else if (sim.tick - inv.bailSince > (TUNING.bailTime + 2) * 60) once('softlock', 'bail-never-ends'); } else inv.bailSince = -1;
    if (!b.grounded) { if (inv.airSince < 0) inv.airSince = sim.tick; else if (sim.tick - inv.airSince > 360) once('airborne', r2(p.y - gy)); } else inv.airSince = -1;
    if (Math.hypot(p.x - inv.lastX, p.z - inv.lastZ) > 2) { inv.lastX = p.x; inv.lastZ = p.z; inv.progressAt = sim.tick; }
    else if (sim.tick - inv.progressAt > 15 * 60) once('stalled', 'no-progress-15s'); // circling or parked: not a bug, the player can always press R
  }

  sim.step = mask => {
    if (sim.done) return true;
    if (mask !== sim.held) { sim.held = mask; sim.inputs.push([sim.tick, mask]); }
    const throttle = !!(mask & BIT.throttle);
    const steer = (mask & BIT.right ? 1 : 0) - (mask & BIT.left ? 1 : 0);
    board.update(DT, { steer, throttle, brake: !!(mask & BIT.brake), tuck: !!(mask & BIT.tuck), pushEdge: throttle && !prevThrottle });
    prevThrottle = throttle;
    sim.tick++;
    const p = board.pos, v = board.vel;
    for (const x of [p.x, p.y, p.z, v.x, v.y, v.z, board.yaw]) H.add(x);
    if (board.justBailed) push('bail');
    if (board.justLaunched) push('air');
    maxX = Math.max(maxX, p.x);
    if (sim.tick % 6 === 0) checks(mask);
    if (!sim.done && p.x >= level.finishX) end('finish');
    if (!sim.done && sim.tick >= maxTicks) end('timeout');
    return sim.done;
  };
  /** Contract form: hold `mask` for n frames. */
  sim.tickN = (mask, n = 1) => { for (let i = 0; i < n && !sim.done; i++) sim.step(mask); return sim.done; };
  sim.hash = () => H.hex() + sim.tick.toString(16);
  sim.time = () => sim.tick * DT;
  sim.observe = () => {
    const b = board, p = b.pos;
    // Probe 8 m ahead for a wall: what a rider sees and steers around.
    const ax = p.x + Math.cos(b.yaw) * 8, az = p.z + Math.sin(b.yaw) * 8;
    const wallAhead = level.tile.buildings.some(bd => insideBox(bd, ax, az));
    const downhill = Math.atan2(collider.heightAt(p.x, p.z - 3) - collider.heightAt(p.x, p.z + 3), collider.heightAt(p.x - 3, p.z) - collider.heightAt(p.x + 3, p.z));
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    return {
      t: r2(sim.time()), x: r2(p.x), z: r2(p.z), speed: r2(b.groundSpeed), yaw: r2(b.yaw), grounded: b.grounded, onRoad: b.onRoad,
      bailing: b.bailTimer > 0, wallAhead, roadOffset: r2(p.z - level.roadZ), downhillErr: r2(wrap(downhill - b.yaw)), headingErr: r2(wrap(-b.yaw)),
      bucket: b.bailTimer > 0 ? 'bail' : !b.grounded ? 'air' : wallAhead ? 'wall' : b.onRoad ? 'road' : 'offroad',
    };
  };
  sim.result = () => ({ out: sim.outcome || 'timeout', t: r2(sim.time()), ev: sim.events, hash: sim.hash(), inputs: sim.inputs, dist: r2(maxX - level.spawn.x) });
  sim.dispose = () => {};
  return sim;
}

/** Replay recorded inputs ([tick, mask][]) exactly. Same shape as engine/sim.mjs inputController. */
export function inputController(inputs) {
  let i = 0, mask = 0;
  return { step(sim) { while (i < inputs.length && inputs[i][0] <= sim.tick) mask = inputs[i++][1]; return mask; } };
}

export function runRound(sim, controller) {
  try { while (!sim.done) sim.step(controller.step(sim) | 0); }
  catch (e) { sim.events.push([r2(sim.time()), 'crash', String(e?.message || e).slice(0, 60)]); sim.done = true; sim.outcome = 'crash'; }
  return sim.result();
}
