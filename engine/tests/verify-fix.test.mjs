// engine/verify-fix.mjs: apply a patch to a scratch copy of game/src, replay the bug's seeds, regress a crowd.
// Runs in child processes from the repo root; scratch copies land in a fresh .work/zt-*-XXXXXX per run (gitignored) and are removed afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { node, tmp, writeJson, makeFixtureRun, ROOT, CRASH_CASE } from './helpers.mjs';

const dir = tmp('verify-');
// Unique per process: a second concurrent run of this suite must not delete this run's scratch copies in its after() hook.
const CRASH = `zt-crash-${process.pid}`, AIR = `zt-air-${process.pid}`;
let airBug;

// Test-only symptom clamp: snaps a fighter above 1.2 m back to the floor, so the airborne invariant cannot fire.
const AIR_FIX = { file: 'character.js', find: 'const p = rb.translation(); root.position.set(', replace: 'if (rb.translation().y > 1.2) { const q = rb.translation(); rb.setTranslation({ x: q.x, y: 0.82, z: q.z }, true); } const p = rb.translation(); root.position.set(' };
// Undoes the shipped props.js throwProp fix in the scratch copy only: the crash must come back there.
const REVERT_CRASH_FIX = { file: 'props.js', find: 'if (prop.rigidBody && !(RULES.throwPropGuard && prop.isBroken)) {', replace: 'if (prop.rigidBody) {' };
// Reproduce the old crash sequence in the scratch copy; the shipped CPU balance can avoid the shattered crate.
const ORIGINAL_CPU = { file: 'tuning.js', find: 'cpuLowBlock: 1', replace: 'cpuLowBlock: 0' };
const HARMLESS = { file: 'props.js', find: 'export function throwProp(', replace: '/* nothing */export function throwProp(' };
const verify = (bug, patches, extra = []) => {
  writeJson(join(dir, 'fixes', `${bug}.json`), { patches });
  const r = node(['engine/verify-fix.mjs', '--bug', bug, '--dir', dir, '--regress', '0', ...extra]);
  return { ...r, out: r.code === 0 ? JSON.parse(r.stdout) : null, report: existsSync(join(dir, 'fixes', `${bug}.verify.json`)) ? JSON.parse(readFileSync(join(dir, 'fixes', `${bug}.verify.json`), 'utf8')) : null };
};
const scratch = (r, file = 'props.js') => readFileSync(join(ROOT, r.out.scratch, 'game/src', file), 'utf8');

before(() => {
  makeFixtureRun(dir);
  const r = node(['engine/bugs.mjs', '--dir', dir]);
  assert.equal(r.code, 0, r.stderr);
  airBug = JSON.parse(readFileSync(join(dir, 'bugs.json'), 'utf8')).find(c => c.signature === 'airborne');
  // Own ids (the real run uses bug1..bug4 and verify-fix wipes .work/<id> first). The crash cluster is the round that crashed before the props.js fix.
  const crash = { id: CRASH, signature: 'crash:RuntimeError: unreachable in throwProp (props.js:303)', count: 1, rounds: [{ p: CRASH_CASE.persona.id, round: 1, seed: CRASH_CASE.seed, label: 'base' }] };
  writeJson(join(dir, 'bugs.json'), [crash, { ...airBug, id: AIR }]);
});
after(() => { for (const d of readdirSync(join(ROOT, '.work')).filter(d => d.startsWith(`${CRASH}-`) || d.startsWith(`${AIR}-`))) rmSync(join(ROOT, '.work', d), { recursive: true, force: true }); });

test('unknown bug id: exits non-zero with a clear message', () => {
  const r = node(['engine/verify-fix.mjs', '--bug', 'zt-nope', '--dir', dir]);
  assert.notEqual(r.code, 0); assert.match(r.stderr, /no zt-nope in .*bugs\.json/);
});

test('missing fix file: exits non-zero', () => {
  const r = node(['engine/verify-fix.mjs', '--bug', CRASH, '--dir', dir, '--fix', join(dir, 'does-not-exist.json'), '--regress', '0']);
  assert.notEqual(r.code, 0);
});

test('patch with a find text that matches 0 times does not apply', () => {
  const r = verify(CRASH, [{ file: 'props.js', find: 'this text is not in props.js at all', replace: 'x' }]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.out.verdict, 'patch-did-not-apply');
  assert.deepEqual(r.out.applied, [{ file: 'props.js', ok: false, why: 'find text not found' }]);
  assert.deepEqual(r.report.after, [], 'no patched replay when nothing applied');
  assert.equal(r.report.fixedRounds, 0);
  assert.equal(r.report.before.length, 1, 'the shipped game is still replayed for reference');
  assert.equal(scratch(r), readFileSync(join(ROOT, 'game/src/props.js'), 'utf8'), 'scratch copy untouched');
});

test('patch whose find text matches more than once does not apply (ambiguous)', () => {
  const src = readFileSync(join(ROOT, 'game/src/props.js'), 'utf8'), n = src.split('prop.rigidBody').length - 1;
  assert.ok(n >= 2);
  const r = verify(CRASH, [{ file: 'props.js', find: 'prop.rigidBody', replace: 'prop.body' }]);
  assert.equal(r.out.verdict, 'patch-did-not-apply');
  assert.deepEqual(r.out.applied, [{ file: 'props.js', ok: false, why: `find text matches ${n} times` }]);
  assert.equal(scratch(r), src);
});

test('patch to a non game/src/*.js file is refused: json, mjs, subdirectory, traversal, absolute, missing, empty', () => {
  for (const file of ['props.json', 'sim.mjs', 'sub/props.js', '../engine/sim.mjs', '../../package.json', '/etc/hosts', 'nope.js', '', 'props.js\n']) {
    const r = verify(CRASH, [{ file, find: 'a', replace: 'b' }]);
    assert.equal(r.out.verdict, 'patch-did-not-apply', JSON.stringify(file));
    assert.deepEqual(r.out.applied, [{ file, ok: false, why: 'not a game/src/*.js file' }], JSON.stringify(file));
  }
  assert.equal(readFileSync(join(ROOT, 'engine/sim.mjs'), 'utf8').includes('prop.body'), false, 'nothing outside the scratch copy was touched');
});

test('empty or missing patch list is "patch-did-not-apply", not "fixed"', () => {
  for (const body of [[], undefined]) {
    writeJson(join(dir, 'fixes', `${CRASH}.json`), body === undefined ? {} : { patches: body });
    const r = node(['engine/verify-fix.mjs', '--bug', CRASH, '--dir', dir, '--regress', '0']);
    assert.equal(JSON.parse(r.stdout).verdict, 'patch-did-not-apply');
    assert.deepEqual(JSON.parse(r.stdout).applied, []);
  }
});

test('one bad patch in a list blocks the whole fix, but the good one is still reported ok', () => {
  const r = verify(CRASH, [HARMLESS, { file: 'props.js', find: 'not present', replace: 'x' }]);
  assert.equal(r.out.verdict, 'patch-did-not-apply');
  assert.deepEqual(r.out.applied.map(a => a.ok), [true, false]);
  assert.deepEqual(r.report.after, []);
});

test('a harmless patch applies but does not fix: "not-fixed", every round replayed; "$&", "$1" and "$$" in the replacement are written literally', () => {
  const marker = '/* $& $1 $$ $` */';
  const r = verify(AIR, [{ file: 'props.js', find: 'export function throwProp(', replace: `${marker}export function throwProp(` }]);
  assert.equal(r.out.verdict, 'not-fixed');
  assert.equal(r.out.fixedRounds, 0); assert.equal(r.out.rounds, 2);
  assert.deepEqual(r.out.applied, [{ file: 'props.js', ok: true }]);
  assert.ok(scratch(r).includes(`${marker}export function throwProp(`), 'special replacement patterns are not interpreted');
  assert.deepEqual(r.report.before.map(b => b.p).sort(), ['p0609', 'p0686']);
  assert.ok(r.report.after.every(a => a.bugs.includes('airborne')));
});

test('a patch that removes the bug is "fixed": the shipped replay still shows it, the patched one does not', () => {
  const r = verify(AIR, [AIR_FIX]);
  assert.equal(r.out.verdict, 'fixed');
  assert.equal(r.out.fixedRounds, 2);
  assert.ok(r.report.before.every(b => b.bugs.includes('airborne')));
  assert.ok(r.report.after.every(a => !a.bugs.includes('airborne')));
  assert.ok(scratch(r, 'character.js').includes('rb.translation().y > 1.2'));
  assert.ok(!readFileSync(join(ROOT, 'game/src/character.js'), 'utf8').includes('rb.translation().y > 1.2'), 'the real game/src is never modified');
});

test('reverting the shipped props.js fix with the original CPU in the scratch copy brings the old crash back: verify-fix reports it', () => {
  const r = verify(CRASH, [REVERT_CRASH_FIX, ORIGINAL_CPU]);
  assert.deepEqual(r.out.applied, [{ file: 'props.js', ok: true }, { file: 'tuning.js', ok: true }]);
  assert.equal(r.report.before[0].crash, null, 'the shipped game no longer crashes on this round');
  assert.match(r.report.after[0].crash, /^RuntimeError: unreachable in throwProp \(props\.js:\d+\)$/);
  assert.equal(r.out.verdict, 'did-not-reproduce', 'the bug was absent before the patch, so the verdict cannot be a fix');
});

test('the report on disk matches stdout fields and records signature, applied patches and per-round before/after', () => {
  const r = verify(AIR, [AIR_FIX]);
  assert.deepEqual(Object.keys(r.report), ['bug', 'signature', 'verdict', 'applied', 'rounds', 'fixedRounds', 'before', 'after', 'regression']);
  assert.equal(r.report.bug, AIR); assert.equal(r.report.signature, airBug.signature);
  assert.equal(r.report.regression, null, '--regress 0 skips the regression crowd');
  assert.deepEqual([r.out.verdict, r.out.fixedRounds, r.out.rounds], [r.report.verdict, r.report.fixedRounds, r.report.rounds]);
});

test('--fix points at an explicit patch file and the default is <dir>/fixes/<bug>.json', () => {
  writeJson(join(dir, 'other-fix.json'), { patches: [AIR_FIX] });
  writeJson(join(dir, 'fixes', `${AIR}.json`), { patches: [{ file: 'props.js', find: 'absent', replace: 'x' }] });
  const viaFlag = node(['engine/verify-fix.mjs', '--bug', AIR, '--dir', dir, '--fix', join(dir, 'other-fix.json'), '--regress', '0']);
  assert.equal(JSON.parse(viaFlag.stdout).verdict, 'fixed');
  const viaDefault = node(['engine/verify-fix.mjs', '--bug', AIR, '--dir', dir, '--regress', '0']);
  assert.equal(JSON.parse(viaDefault.stdout).verdict, 'patch-did-not-apply');
});

test('regression crowd: a no-op patch plays the same crowd as the shipped game; a fix lowers bug rounds; a reverted fix crashes a session', () => {
  const run = (bug, patches, seed = '2') => { writeJson(join(dir, 'fixes', `${bug}.json`), { patches }); return JSON.parse(node(['engine/verify-fix.mjs', '--bug', bug, '--dir', dir, '--regress', '3', '--seed', seed]).stdout); };
  const noop = run(AIR, [HARMLESS]);
  assert.equal(noop.regression.personas, 3);
  assert.deepEqual(noop.regression.patched, noop.regression.shipped, 'scratch copy of engine + patched game reproduces the shipped crowd exactly');
  assert.ok(noop.regression.shipped.bugRounds >= 2, 'the two airborne rounds');
  assert.deepEqual(Object.keys(noop.regression.shipped), ['rounds', 'winRate', 'avgT', 'bugRounds']);
  const fixed = run(AIR, [AIR_FIX]);
  assert.ok(fixed.regression.patched.bugRounds < fixed.regression.shipped.bugRounds);
  // The fixture run is base seed 2; the old crash is p0047 r1 at base seed 1 (CRASH_CASE), so that crowd is played at seed 1.
  const reverted = run(CRASH, [REVERT_CRASH_FIX, ORIGINAL_CPU], '1');
  const crashed = readFileSync(join(ROOT, reverted.scratch, 'out/runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.ev.some(e => e[1] === 'crash'));
  assert.deepEqual(crashed.map(r => `${r.p}:${r.round}`), ['p0047:1'], 'the reverted fix crashes the session at the old crash round');
});

test('parallel runs of the same bug get their own scratch folders (roast fix 10)', async () => {
  const { spawn } = await import('node:child_process');
  writeJson(join(dir, 'fixes', `${AIR}.json`), { patches: [AIR_FIX] });
  const once = () => new Promise(res => { let out = ''; const c = spawn(process.execPath, ['engine/verify-fix.mjs', '--bug', AIR, '--dir', dir, '--regress', '0'], { cwd: ROOT }); c.stdout.on('data', d => { out += d; }); c.on('close', code => res({ code, out: JSON.parse(out) })); });
  const runs = await Promise.all([once(), once(), once()]);
  assert.deepEqual(runs.map(r => [r.code, r.out.verdict]), Array(3).fill([0, 'fixed']));
  assert.equal(new Set(runs.map(r => r.out.scratch)).size, 3);
  for (const r of runs) assert.match(r.out.scratch, new RegExp(`^\\.work/${AIR}-\\w{6}$`));
});

test('a bug that does not reproduce on the shipped game is reported "did-not-reproduce", never "fixed"', () => {
  const clean = verify(CRASH, [HARMLESS]);
  assert.deepEqual(clean.report.before[0].bugs, [], 'precondition: shipped replay is clean (the props.js fix is in)');
  assert.equal(clean.out.verdict, 'did-not-reproduce', 'a fix cannot be credited for a bug that did not reproduce');
});
