import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roundSeed, fighterFor } from '../crowd-worker-lib.mjs';
import { hashString } from '../sim.mjs';

test('roundSeed: pure function of (persona, round, base), always a 6-digit seed', () => {
  assert.equal(roundSeed('p0001', 1, 1), roundSeed('p0001', 1, 1));
  assert.equal(roundSeed('p0001', 1, 1), 100000 + (hashString('p0001:1:1') % 900000));
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const s = roundSeed(`p${String(i).padStart(4, '0')}`, 1 + (i % 5), 1);
    assert.ok(Number.isInteger(s) && s >= 100000 && s <= 999999, `seed ${s}`);
    seen.add(s);
  }
  assert.ok(seen.size > 395, `${seen.size} distinct seeds of 400 (collisions are possible but rare)`);
});

test('roundSeed varies with each input', () => {
  const s = roundSeed('p0007', 2, 1);
  assert.notEqual(s, roundSeed('p0008', 2, 1));
  assert.notEqual(s, roundSeed('p0007', 3, 1));
  assert.notEqual(s, roundSeed('p0007', 2, 2));
  assert.notEqual(roundSeed('p0007', 12, 1), roundSeed('p0071', 2, 1), 'the ":" separator keeps (p0007,12) and (p0071,2) apart');
  assert.equal(roundSeed('p0007', 2, '1'), s, 'base seed given as a string (CLI arg) is the same input');
});

test('fighterFor: deterministic, splits the crowd roughly evenly between kai and rook', () => {
  assert.equal(fighterFor('p0001'), fighterFor('p0001'));
  let rook = 0;
  for (let i = 0; i < 1000; i++) { const f = fighterFor(`p${String(i).padStart(4, '0')}`); assert.ok(f === 'kai' || f === 'rook'); if (f === 'rook') rook++; }
  assert.ok(rook > 440 && rook < 560, `rook ${rook}/1000`);
  assert.equal(fighterFor('p0047'), 'kai'); assert.equal(fighterFor('p0653'), fighterFor('p0653'));
  assert.equal(fighterFor('x') , hashString('x') % 2 ? 'rook' : 'kai');
});

test('crowd-worker.mjs carries its own copy of roundSeed/fighterFor: it must not drift from crowd-worker-lib.mjs', () => {
  // crowd-worker.mjs cannot be imported (it needs worker_threads' parentPort), so compare the source text.
  const grab = (src, name) => src.match(new RegExp(`export function ${name}\\([^)]*\\) \\{[^\\n]*\\}`))?.[0];
  const lib = readFileSync(new URL('../crowd-worker-lib.mjs', import.meta.url), 'utf8'), worker = readFileSync(new URL('../crowd-worker.mjs', import.meta.url), 'utf8');
  for (const fn of ['roundSeed', 'fighterFor']) {
    assert.ok(grab(lib, fn), `${fn} in lib`);
    assert.equal(grab(worker, fn), grab(lib, fn), `${fn} copy drifted`);
  }
});
