// node --import tsx --test adapters/homeground/homeground.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runRound, inputController, BIT, HALF } from './sim.mjs';
import { createPolicy, createFuzzer } from './policy.mjs';
import { loadPersonas } from '../lib/common.mjs';

/** Flat tile, one road along +X, one building across it at x=10..30. */
function flatLevel() {
  const sp = 10, n = (HALF * 2) / sp + 1;
  return {
    tile: { origin: { lat: 0, lon: 0 }, radiusMeters: HALF, terrain: { width: n, depth: n, spacing: sp, originX: -HALF, originZ: -HALF, elevations: new Array(n * n).fill(0) },
      roads: [{ centerline: [{ x: -HALF, z: 0 }, { x: HALF, z: 0 }], widthMeters: 24, tag: 'r', osmTags: {} }],
      buildings: [{ footprint: [{ x: 10, z: -20 }, { x: 30, z: -20 }, { x: 30, z: 20 }, { x: 10, z: 20 }], height: 10, tag: 'r', osmTags: {} }], generatedAt: '' },
    roadZ: 0, spawn: { x: 0, z: 0, yaw: 0 }, finishX: 1e9,
  };
}

test('same seed + same persona twice gives the same hash; replaying recorded inputs matches too', () => {
  const p = loadPersonas(3)[2];
  const a = runRound(createSim({ seed: 42, maxT: 20 }), createPolicy(p, 42));
  const b = runRound(createSim({ seed: 42, maxT: 20 }), createPolicy(p, 42));
  const c = runRound(createSim({ seed: 42, maxT: 20 }), inputController(a.inputs));
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash, c.hash);
  assert.notEqual(a.hash, runRound(createSim({ seed: 43, maxT: 20 }), createPolicy(p, 42)).hash);
});

test('fuzzer rounds are deterministic', () => {
  const a = runRound(createSim({ seed: 5, maxT: 10 }), createFuzzer(5));
  assert.equal(a.hash, runRound(createSim({ seed: 5, maxT: 10 }), inputController(a.inputs)).hash);
});

test('riding off the tile edge raises oob (the game has no boundary)', () => {
  const lvl = flatLevel();
  lvl.tile.buildings = [];
  lvl.spawn = { x: HALF - 20, z: 0, yaw: 0 };
  const r = runRound(createSim({ seed: 1, level: lvl, maxT: 30 }), { step: s => (s.tick % 30 < 15 ? BIT.throttle : 0) });
  assert.equal(r.out, 'oob');
  assert.ok(r.ev.some(e => e[1] === 'oob'));
});

test('pushing straight into a wall raises stuck', () => {
  const r = runRound(createSim({ seed: 1, level: flatLevel(), maxT: 12 }), { step: () => BIT.throttle });
  assert.ok(r.ev.some(e => e[1] === 'stuck'), JSON.stringify(r.ev));
});

test('a NaN in the board state is caught', () => {
  const s = createSim({ seed: 1, maxT: 5 });
  s.step(0);
  s.board.vel.x = NaN;
  for (let i = 0; i < 6; i++) s.step(0);
  assert.equal(s.outcome, 'crash');
  assert.ok(s.events.some(e => e[1] === 'nan'));
});
