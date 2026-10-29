// rules.grabReleaseFix (bug hunt, docs/bug-hunt.md): a fighter held by setTranslation while GRABBED keeps a stale floor
// contact after the grab ends, sinks ~0.3 m into the floor and is ejected upward; next to the wall it rides the wall up
// and leaves the arena. This is bug2's cause (2) reached through a throw instead of a mount, so bug2 still happened on
// the shipped build. 0 = the original behavior and today's default (see game/src/tuning.js), 1 = the fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULE_DEFAULTS } from '../../game/src/tuning.js';
import { play, ROOT, BUG_CODES } from './helpers.mjs';

const personas = JSON.parse(readFileSync(`${ROOT}/data/run-main/personas.json`, 'utf8'));
const p0653 = personas.find(p => p.id === 'p0653');
const bugs = res => res.ev.filter(e => BUG_CODES.includes(e[1])).map(e => e[1]);
// Found by the hunt crowd on the shipped build (base seeds 2027 and 424242): thrown into the left wall, then oob.
const CASES = [{ seed: 777603, oobAt: 35.1 }, { seed: 741228, oobAt: 20.1 }];

const ON = { 'rules.grabReleaseFix': 1 };
test('grabReleaseFix is a known rule and data/run-main/meta.json records the run without it', () => {
  assert.ok('grabReleaseFix' in RULE_DEFAULTS);
  assert.equal(JSON.parse(readFileSync(`${ROOT}/data/run-main/meta.json`, 'utf8')).recordedWith['rules.grabReleaseFix'], 0);
});

for (const c of CASES) {
  test(`seed ${c.seed}: off reproduces the wall escape, on clears it`, async () => {
    const off = (await play(p0653, c.seed, { tuning: { 'rules.grabReleaseFix': 0 } })).res;
    assert.deepEqual(bugs(off), ['airborne', 'oob', 'softlock']);
    assert.equal(off.ev.find(e => e[1] === 'oob')[0], c.oobAt);
    const on = (await play(p0653, c.seed, { tuning: ON })).res;
    assert.deepEqual(bugs(on), []);
    assert.ok(on.t < 99, `round should end by KO, ended at ${on.t}`);
  });
}

test('grabReleaseFix is inert in a round with no grab', async () => {
  const persona = personas.find(p => p.id === 'p0001'), seed = 123457;
  const on = (await play(persona, seed, { tuning: ON })).res, off = (await play(persona, seed, { tuning: { 'rules.grabReleaseFix': 0 } })).res;
  assert.ok(!on.ev.some(e => e[1] === 'throw') && !off.ev.some(e => e[1] === 'throw'), 'pick a seed without a grab');
  assert.equal(on.hash, off.hash);
});
