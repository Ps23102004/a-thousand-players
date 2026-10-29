// Bug hunt H4: an attack's `active` is the END of its hit window (animation.js: startup <= animTime < active), so a tuning with
// active <= startup has no window and the move can never hit. The old minimum (25% of default) did that to every move, and
// startup near its maximum does it at the default active. Every corner of the allowed range must still play: strikes land.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTuning, DT } from '../sim.mjs';
import { ANIMATIONS } from '../../game/src/animation.js';
import { play, ROOT } from './helpers.mjs';
import { roundSeed } from '../crowd-worker-lib.mjs';

const specs = JSON.parse(readFileSync(`${ROOT}/data/baseline-tuning.json`, 'utf8'));
const spec = k => specs.find(p => p.key === k);
const actives = specs.filter(p => p.key.endsWith('.active'));
const personas = JSON.parse(readFileSync(`${ROOT}/data/run-main/personas.json`, 'utf8'));
const STRIKES = new Set(actives.map(p => p.key.split('.')[1]).filter(n => !n.startsWith('THROW')));
const N = +(process.env.HUNT_RANGE_ROUNDS || 8);
afterEach(() => applyTuning(null));

test('every active minimum leaves a hit window at the default startup', () => {
  for (const a of actives) assert.ok(a.min >= spec(a.key.replace('active', 'startup')).default + 2 * DT, `${a.key} min ${a.min}`);
});

test('applyTuning keeps at least 2 ticks of hit window when startup is tuned past active', () => {
  applyTuning({ 'anim.JAB.startup': 0.24, 'anim.JAB.active': 0.1, 'anim.CROSS.startup': 0.4 });
  assert.equal(ANIMATIONS.JAB.active, 0.24 + 2 * DT); assert.equal(ANIMATIONS.CROSS.active, 0.4 + 2 * DT);
  applyTuning({ 'anim.SWEEP.startup': 0.14 }); // data/patches/sweep-nerf.json: window 0.04 s, left as is
  assert.equal(ANIMATIONS.SWEEP.active, 0.18);
  applyTuning(null);
  assert.equal(ANIMATIONS.JAB.active, 0.14, 'the shipped game is untouched');
});

const edge = (side, field) => Object.fromEntries(actives.map(a => { const k = a.key.replace('active', field); return [k, spec(k)[side]]; }));
const CORNERS = {
  'active min': edge('min', 'active'), 'active max': edge('max', 'active'), 'startup max': edge('max', 'startup'),
  'startup max + active min': { ...edge('max', 'startup'), ...edge('min', 'active') }, 'startup min + active max': { ...edge('min', 'startup'), ...edge('max', 'active') },
};
for (const [name, tuning] of Object.entries(CORNERS)) {
  test(`range corner "${name}": strikes land and rounds do not stall`, async () => {
    let hits = 0, softlocks = 0;
    for (let i = 0; i < N; i++) {
      const p = personas[i * 7], seed = roundSeed(p.id, 1, 4040);
      const { res } = await play(p, seed, { tuning, maxT: 60 });
      hits += res.ev.filter(e => e[1] === 'hit' && STRIKES.has(e[3])).length; softlocks += res.ev.some(e => e[1] === 'softlock');
    }
    assert.ok(hits >= 3 * N, `${hits} strike hits in ${N} rounds`);
    assert.ok(softlocks <= N / 4, `${softlocks} softlocks in ${N} rounds`);
  });
}
