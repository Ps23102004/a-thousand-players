// Bug-oracle events the sim emits (oob, airborne, clip, nan, stuck, softlock) fired on constructed situations:
// the controller moves the real Rapier bodies / fighter state, the sim's own checks() must notice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runRound, BIT } from '../sim.mjs';
import { syntheticPersona } from '../policy.mjs';
import { play, BUG_CODES } from './helpers.mjs';

async function scenario(opts, step) {
  const sim = await createSim({ seed: 1, rivalAI: false, ...opts });
  const res = await runRound(sim, { step });
  sim.dispose();
  return res;
}
const bugs = res => res.ev.filter(e => BUG_CODES.includes(e[1]));
const freeze = (f, p) => { f.rigidBody.setTranslation(p, true); f.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true); };

test('oob: x beyond 10.45, below the floor or beyond z 2.3 fires once, for the right fighter', async () => {
  for (const [name, pos] of [['x', { x: 12, y: 0.5, z: 0 }], ['y', { x: 0, y: -2, z: 0 }], ['z', { x: 0, y: 0.5, z: 3.5 }], ['-x', { x: -12, y: 0.5, z: 0 }]]) {
    const res = await scenario({ maxT: 4 }, s => { if (s.tick === 30) s.rival.rigidBody.setTranslation(pos, true); return 0; });
    const oob = res.ev.filter(e => e[1] === 'oob');
    assert.equal(oob.length, 1, `${name}: one oob event even though the fighter stays out`);
    assert.equal(oob[0][2], 1, `${name}: attributed to the rival`);
  }
  const res = await scenario({ maxT: 3 }, s => { if (s.tick === 20) s.player.rigidBody.setTranslation({ x: 11, y: 0.5, z: 0 }, true); return 0; });
  const e = res.ev.find(x => x[1] === 'oob');
  assert.equal(e[2], 0); assert.ok(e[3] > 10, 'arg carries the x position');
});

test('no oob just inside the limits', async () => {
  const res = await scenario({ maxT: 3 }, s => { if (s.tick < 90) freeze(s.rival, { x: 9.8, y: 0.5, z: 0 }); return 0; });
  assert.ok(!res.ev.some(e => e[1] === 'oob'));
});

test('airborne: above 1.3 m for more than 2.5 s fires once; a shorter hop does not', async () => {
  const hold = (secs) => s => { if (s.tick < secs * 60) freeze(s.player, { x: 0, y: 3, z: 0 }); return 0; };
  const long = await scenario({ maxT: 8 }, hold(7));
  const air = long.ev.filter(e => e[1] === 'airborne');
  assert.equal(air.length, 1); assert.equal(air[0][2], 0);
  assert.ok(air[0][0] >= 2.5 && air[0][0] <= 3.5, `fired at ${air[0][0]}`);
  const short = await scenario({ maxT: 8 }, hold(1.5));
  assert.ok(!short.ev.some(e => e[1] === 'airborne'));
});

test('clip: fighters sharing a spot for over 2 s fire clip once, attributed to 0', async () => {
  const res = await scenario({ maxT: 8 }, s => { const p = s.player.rigidBody.translation(); freeze(s.rival, { x: p.x, y: p.y, z: p.z }); return 0; });
  const clip = res.ev.filter(e => e[1] === 'clip');
  assert.equal(clip.length, 1); assert.equal(clip[0][2], 0); assert.ok(clip[0][0] >= 2 && clip[0][0] < 3.5);
  const brief = await scenario({ maxT: 8 }, s => { if (s.tick < 60) { const p = s.player.rigidBody.translation(); freeze(s.rival, { x: p.x, y: p.y, z: p.z }); } return 0; });
  assert.ok(!brief.ev.some(e => e[1] === 'clip'), 'one second of overlap is not a clip');
});

test('nan: a non-finite health fires nan, ends the round at once as a draw', async () => {
  const res = await scenario({ maxT: 20 }, s => { if (s.tick === 10) s.rival.health = NaN; return 0; });
  const nan = res.ev.filter(e => e[1] === 'nan');
  assert.equal(nan.length, 1); assert.equal(nan[0][2], 1);
  assert.equal(res.out, 'draw'); assert.ok(res.t < 1, `ended at ${res.t}`);
});

test('stuck: the same non-neutral state for over 10 s fires once with the state name; neutral states never do', async () => {
  const res = await scenario({ maxT: 20 }, s => { s.player.state = 'KNOCKDOWN'; return 0; });
  const st = res.ev.filter(e => e[1] === 'stuck');
  assert.equal(st.length, 1); assert.deepEqual([st[0][2], st[0][3]], [0, 'KNOCKDOWN']); assert.ok(st[0][0] >= 10 && st[0][0] < 10.6, `at ${st[0][0]}`);
  const crouch = await scenario({ maxT: 20 }, s => { s.player.state = 'CROUCH'; return 0; });
  assert.ok(!crouch.ev.some(e => e[1] === 'stuck'), 'CROUCH is a legitimate long state');
  const idle = await scenario({ maxT: 20 }, () => 0);
  assert.ok(!idle.ev.some(e => e[1] === 'stuck'), 'IDLE is a legitimate long state');
});

test('stuck re-arms after the state changes', async () => {
  const res = await scenario({ maxT: 40 }, s => { s.player.state = s.tick < 14 * 60 ? 'DOWNED' : s.tick < 15 * 60 ? 'IDLE' : 'PINNED'; return 0; });
  assert.deepEqual(res.ev.filter(e => e[1] === 'stuck').map(e => e[3]), ['DOWNED', 'PINNED']);
});

test('softlock: 25 s with no hp change fires once ("stalemate"), a round with damage does not', async () => {
  const res = await scenario({ maxT: 60 }, () => 0);
  const sl = res.ev.filter(e => e[1] === 'softlock');
  assert.equal(sl.length, 1); assert.deepEqual([sl[0][2], sl[0][3]], [0, 'stalemate']); assert.ok(sl[0][0] >= 25 && sl[0][0] < 26, `at ${sl[0][0]}`);
  const live = await scenario({ maxT: 60 }, s => { if (s.tick % (20 * 60) === 0) s.rival.health -= 1; return 0; });
  assert.ok(!live.ev.some(e => e[1] === 'softlock'), 'hp changed every 20 s');
});

test('combo: three player hits inside 2 s log combo (who 0, arg = running count) and raise maxCombo', async () => {
  // Park the rival in front of the player and mash J/K; refill its hp so the round runs on instead of ending in a KO.
  const res = await scenario({ maxT: 40 }, s => {
    s.rival.health = 100;
    const d = s.rival.rigidBody.translation().x - s.player.rigidBody.translation().x;
    if (d > 0.9) return BIT.KeyD;
    const ph = s.tick % 6; return ph === 0 ? BIT.KeyJ : ph === 3 ? BIT.KeyK : 0;
  });
  const hits = res.ev.filter(e => e[1] === 'hit' && e[2] === 0);
  assert.ok(hits.length > 10, `landed ${hits.length} hits`);
  const combo = res.ev.filter(e => e[1] === 'combo');
  assert.ok(combo.length > 0 && combo.every(e => e[2] === 0 && e[3] >= 3));
  assert.ok(res.maxCombo >= 3 && res.maxCombo === Math.max(...combo.map(e => e[3])));
  assert.ok(res.ev.some(e => e[1] === 'knockdown' && e[2] === 1), 'knockdowns of the rival are logged against who=1');
});

test('the event list is capped at 220, so later events (even bugs) are dropped', async () => {
  // Fire the sim's own ground-event hook 300 times, then trigger an oob afterwards.
  const res = await scenario({ maxT: 4 }, s => {
    if (s.tick === 5) for (let i = 0; i < 300; i++) s.player.onGroundEvent({ type: 'knockdown', defender: s.player });
    if (s.tick === 60) s.rival.rigidBody.setTranslation({ x: 12, y: 0.5, z: 0 }, true);
    return 0;
  });
  assert.equal(res.ev.length, 220);
  assert.ok(res.ev.every(e => e[1] === 'knockdown'));
  assert.ok(!res.ev.some(e => e[1] === 'oob'), 'the oob after the cap is invisible to the oracle (lib/oracle.ts EVENT_CAP)');
});

test('a normal AI-driven round raises no invariant events on these known-clean seeds', async () => {
  for (const [i, seed] of [[0, 8000], [1, 15919], [2, 23838], [3, 31757]]) {
    const { res } = await play(syntheticPersona(i), seed);
    assert.deepEqual(bugs(res), [], `${syntheticPersona(i).id} seed ${seed}`);
  }
});
