// rules.knockdownOnPropFix (bug hunt H3, bug4's cause): KNOCKDOWN's FALL phase only ends once the body is below y = 1.08,
// so a fighter knocked onto a crate (resting at y 1.2 to 1.4) stays in FALL until the time limit: stuck:KNOCKDOWN, then
// softlock. The fix also ends FALL once the body is asleep (at rest), keeping the height guard for every other case.
// 0 = the original behavior (data/run-main/meta.json records the run with it), 1 = the fix and the default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULE_DEFAULTS } from '../../game/src/tuning.js';
import { play, ROOT, BUG_CODES } from './helpers.mjs';

const personas = JSON.parse(readFileSync(`${ROOT}/data/run-main/personas.json`, 'utf8'));
const p0653 = personas.find(p => p.id === 'p0653');
const bugs = res => res.ev.filter(e => BUG_CODES.includes(e[1])).map(e => e[1]);
const SEED = 529060; // bug4's representative round (p0653 r2): knocked onto the left crate at 15.87 s

test('knockdownOnPropFix is on by default and data/run-main/meta.json records the run without it', () => {
  assert.equal(RULE_DEFAULTS.knockdownOnPropFix, 1);
  assert.equal(JSON.parse(readFileSync(`${ROOT}/data/run-main/meta.json`, 'utf8')).recordedWith['rules.knockdownOnPropFix'], 0);
});

test(`seed ${SEED}: off stays in KNOCKDOWN on the crate, on ends FALL and the round ends by KO`, async () => {
  const off = (await play(p0653, SEED, { tuning: { 'rules.knockdownOnPropFix': 0 } })).res;
  assert.deepEqual(bugs(off), ['airborne', 'stuck', 'softlock']);
  assert.deepEqual(off.ev.find(e => e[1] === 'stuck'), [26, 'stuck', 0, 'KNOCKDOWN']);
  const on = (await play(p0653, SEED)).res;
  assert.deepEqual(bugs(on), []);
  assert.ok(on.ev.some(e => e[0] > 16 && e[1] === 'mount'), 'the rival mounts the downed player: FALL ended');
  assert.ok(on.ko && on.t < 99, `round ends by KO, ended at ${on.t}`);
});

test('knockdownOnPropFix keeps the height guard: rounds whose knockdowns land on the floor are unchanged', async () => {
  const persona = personas.find(p => p.id === 'p0001'), seed = 123457;
  const on = (await play(persona, seed)).res, off = (await play(persona, seed, { tuning: { 'rules.knockdownOnPropFix': 0 } })).res;
  assert.ok(on.ev.some(e => e[1] === 'knockdown'), 'pick a seed with a knockdown');
  assert.equal(on.hash, off.hash);
});
