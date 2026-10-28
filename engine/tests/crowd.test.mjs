// engine/crowd.mjs + crowd-worker.mjs end to end: real worker threads, real sims, small crowd.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { node, tmp, writeJson, BUG_CODES } from './helpers.mjs';
import { syntheticPersona } from '../policy.mjs';
import { roundSeed, fighterFor } from '../crowd-worker-lib.mjs';

const dir = tmp('crowd-'), personas = Array.from({ length: 6 }, (_, i) => syntheticPersona(i));
const crowd = (extra, out) => node(['engine/crowd.mjs', '--personas', join(dir, 'personas.json'), '--out', out, '--workers', '2', ...extra]);
const lines = f => readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
let a, b;

before(() => {
  writeJson(join(dir, 'personas.json'), personas);
  writeJson(join(dir, 'tune.json'), { 'anim.JAB.damage': 40, 'anim.CROSS.damage': 40, 'anim.HOOK.damage': 40 });
  a = crowd(['--seed', '7', '--rounds', '3'], join(dir, 'a'));
  b = crowd(['--seed', '7', '--rounds', '3'], join(dir, 'b'));
});

test('exits 0 and prints the summary line', () => {
  assert.equal(a.code, 0, a.stderr);
  assert.match(a.stderr, /6 players, \d+ rounds, [\d.]+s on 2 workers .*win rate [\d.]+%; game crashes \d+/);
});

test('writes runs.jsonl, sessions.json and traces.json for the base label', () => {
  for (const f of ['runs.jsonl', 'sessions.json', 'traces.json']) assert.ok(existsSync(join(dir, 'a', f)), f);
});

test('every run line has the RunLine shape and a seed from roundSeed()', () => {
  const runs = lines(join(dir, 'a/runs.jsonl'));
  assert.ok(runs.length >= 6 && runs.length <= 18);
  for (const r of runs) {
    assert.deepEqual(Object.keys(r), ['p', 'round', 'seed', 'tuning', 'out', 't', 'hp', 'ko', 'ev', 'dmg', 'maxCombo', 'mood']);
    assert.equal(r.tuning, 'base');
    assert.equal(r.seed, roundSeed(r.p, r.round, 7));
    assert.ok(['win', 'loss', 'draw'].includes(r.out));
    assert.ok(r.round >= 1 && r.round <= 3);
    for (const k of ['frustration', 'boredom']) assert.ok(r.mood[k] >= 0 && r.mood[k] <= 1);
  }
  const ids = new Set(runs.map(r => r.p));
  assert.deepEqual([...ids].sort(), personas.map(p => p.id));
  assert.deepEqual(runs.map(r => r.p), [...runs.map(r => r.p)].sort(), 'sorted by persona');
  for (const id of ids) assert.deepEqual(runs.filter(r => r.p === id).map(r => r.round), runs.filter(r => r.p === id).map((_, i) => i + 1), `${id}: rounds consecutive from 1`);
});

test('sessions.json: one per persona, a quit reason that matches the rounds played', () => {
  const sessions = JSON.parse(readFileSync(join(dir, 'a/sessions.json'), 'utf8')), runs = lines(join(dir, 'a/runs.jsonl'));
  assert.equal(sessions.length, 6);
  for (const s of sessions) {
    assert.ok(['frustration', 'boredom', 'satisfied', 'cap', 'crash'].includes(s.quit.reason), s.quit.reason);
    const played = runs.filter(r => r.p === s.p).length;
    assert.equal(s.quit.afterRound, played, `${s.p} quits after the last round it played`);
    if (s.quit.reason === 'cap') assert.equal(played, 3);
    else assert.ok(played >= 1);
  }
});

test('traces.json has a 10 Hz trace for each first round, keyed persona:round:seed', () => {
  const t = JSON.parse(readFileSync(join(dir, 'a/traces.json'), 'utf8')), runs = lines(join(dir, 'a/runs.jsonl'));
  assert.equal(t.arenaHalfWidth, 10.5); assert.ok(t.states.includes('IDLE'));
  const first = runs.filter(r => r.round === 1);
  assert.deepEqual(Object.keys(t.traces).sort(), first.map(r => `${r.p}:1:${r.seed}`).sort());
  for (const [key, tr] of Object.entries(t.traces)) { assert.equal(tr.key, key); assert.equal(tr.dt, 0.1); assert.ok(tr.f.length > 5); assert.equal(tr.f[0].length, 6); }
});

test('two runs of the same crowd and seed are byte-identical (worker scheduling does not matter)', () => {
  assert.equal(b.code, 0, b.stderr);
  for (const f of ['runs.jsonl', 'sessions.json', 'traces.json']) assert.equal(readFileSync(join(dir, 'a', f), 'utf8'), readFileSync(join(dir, 'b', f), 'utf8'), f);
});

test('a different --seed gives different rounds', () => {
  const c = crowd(['--seed', '8', '--rounds', '2'], join(dir, 'c'));
  assert.equal(c.code, 0, c.stderr);
  const x = lines(join(dir, 'a/runs.jsonl')).map(r => r.seed), y = lines(join(dir, 'c/runs.jsonl')).map(r => r.seed);
  assert.equal(x.filter(s => y.includes(s)).length, 0);
});

test('--limit and --rounds cap the crowd; --noquit plays every round; fixed-length sessions end with reason "cap"', () => {
  const r = crowd(['--seed', '3', '--rounds', '2', '--limit', '3', '--noquit', '1'], join(dir, 'd'));
  assert.equal(r.code, 0, r.stderr);
  const runs = lines(join(dir, 'd/runs.jsonl')), sessions = JSON.parse(readFileSync(join(dir, 'd/sessions.json'), 'utf8'));
  assert.equal(new Set(runs.map(x => x.p)).size, 3);
  assert.equal(runs.length, 6);
  assert.ok(sessions.every(s => s.quit.reason === 'cap' && s.quit.afterRound === 2));
});

test('--label writes runs-<label>.jsonl, applies --tuning, and skips traces by default', () => {
  const r = crowd(['--seed', '7', '--rounds', '1', '--label', 'hard', '--tuning', join(dir, 'tune.json')], join(dir, 'e'));
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(join(dir, 'e/runs-hard.jsonl')) && existsSync(join(dir, 'e/sessions-hard.json')));
  assert.ok(!existsSync(join(dir, 'e/traces.json')) && !existsSync(join(dir, 'e/runs.jsonl')));
  const hard = lines(join(dir, 'e/runs-hard.jsonl')), base = lines(join(dir, 'a/runs.jsonl')).filter(x => x.round === 1);
  assert.ok(hard.every(x => x.tuning === 'hard'));
  assert.deepEqual(hard.map(x => x.seed), base.map(x => x.seed), 'tuning does not change the seeds');
  const dmg = rs => rs.reduce((s, x) => s + x.dmg[0] + x.dmg[1], 0);
  assert.notEqual(JSON.stringify(hard.map(x => x.ev)), JSON.stringify(base.map(x => x.ev)), 'the tuned crowd plays differently');
  assert.ok(dmg(hard) !== dmg(base));
});

test('--traces 1 forces traces for a labelled run; --traces 0 suppresses them for base', () => {
  assert.ok(existsSync(join(dir, 'a/traces.json')));
  const r = crowd(['--seed', '7', '--rounds', '1', '--limit', '2', '--traces', '0'], join(dir, 'f'));
  assert.equal(r.code, 0); assert.ok(!existsSync(join(dir, 'f/traces.json')));
  const t = crowd(['--seed', '7', '--rounds', '1', '--limit', '2', '--label', 'x', '--traces', '1'], join(dir, 'g'));
  assert.equal(t.code, 0); assert.ok(existsSync(join(dir, 'g/traces.json')));
});

test('regression: the former crash persona (p0047, base seed 1) plays a normal session, no crash, no respawn', () => {
  writeJson(join(dir, 'crash-personas.json'), [syntheticPersona(47), syntheticPersona(1)]);
  const r = node(['engine/crowd.mjs', '--personas', join(dir, 'crash-personas.json'), '--out', join(dir, 'h'), '--workers', '1', '--seed', '1', '--rounds', '2', '--noquit', '1']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /game crashes 0/);
  const runs = lines(join(dir, 'h/runs.jsonl')), sessions = JSON.parse(readFileSync(join(dir, 'h/sessions.json'), 'utf8'));
  assert.deepEqual(runs.map(x => `${x.p}:${x.round}`), ['p0001:1', 'p0001:2', 'p0047:1', 'p0047:2']);
  assert.ok(runs.every(x => !x.ev.some(e => e[1] === 'crash')) && BUG_CODES.includes('crash'));
  assert.ok(sessions.every(s => s.quit.reason === 'cap'));
  assert.equal(fighterFor('p0047'), 'kai');
});
