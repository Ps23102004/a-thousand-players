// Apply a proposed fix to a scratch copy of the game, replay the bug's exact seeds, and run a regression crowd.
//   node engine/verify-fix.mjs --bug bug2 [--dir data/run-main] [--fix data/run-main/fixes/bug2.json] [--regress 200]
// fix JSON: { "patches": [ { "file": "ground.js", "find": "exact text", "replace": "new text" } ] }
import { readFileSync, writeFileSync, cpSync, rmSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const bugId = arg('bug'), dir = arg('dir', 'data/run-main'), fixPath = arg('fix', `${dir}/fixes/${bugId}.json`), regressN = +arg('regress', '200');
const bug = JSON.parse(readFileSync(`${dir}/bugs.json`, 'utf8')).find(b => b.id === bugId);
if (!bug) throw new Error(`no ${bugId} in ${dir}/bugs.json`);
const fix = JSON.parse(readFileSync(fixPath, 'utf8'));

// Scratch copy: patched game/src next to an engine copy, so the engine's '../game/src' imports pick up the patch.
const work = `.work/${bugId}`;
rmSync(work, { recursive: true, force: true });
cpSync('game/src', `${work}/game/src`, { recursive: true });
mkdirSync(`${work}/engine`, { recursive: true });
for (const f of readdirSync('engine').filter(f => f.endsWith('.mjs'))) cpSync(`engine/${f}`, `${work}/engine/${f}`);

const applied = (fix.patches || []).map(p => {
  if (!/^[\w.-]+\.js$/.test(p.file) || !existsSync(`${work}/game/src/${p.file}`)) return { file: p.file, ok: false, why: 'not a game/src/*.js file' };
  const path = `${work}/game/src/${p.file}`, src = readFileSync(path, 'utf8'), n = src.split(p.find).length - 1;
  if (n !== 1) return { file: p.file, ok: false, why: n === 0 ? 'find text not found' : `find text matches ${n} times` };
  writeFileSync(path, src.replace(p.find, () => p.replace));
  return { file: p.file, ok: true };
});
const allApplied = applied.length > 0 && applied.every(a => a.ok);

const check = (engineDir, r) => JSON.parse(execFileSync(process.execPath, [`${engineDir}/check-round.mjs`, JSON.stringify(r), dir], { encoding: 'utf8' }).trim().split('\n').pop());
const codes = new Set(bug.signature.split('+').map(s => s.split(':')[0]));
const rounds = bug.rounds.map(({ p, round, seed, label }) => ({ p, round, seed, label }));
const before = rounds.map(r => check('engine', r));
const after = allApplied ? rounds.map(r => check(`${work}/engine`, r)) : [];
const fixedRounds = after.filter(a => !a.bugs.some(c => codes.has(c))).length;

// Regression: the first N personas, base tuning, patched vs shipped game.
let regression = null;
if (allApplied && regressN > 0) {
  execFileSync(process.execPath, [`${work}/engine/crowd.mjs`, '--personas', `${dir}/personas.json`, '--limit', String(regressN), '--out', `${work}/out`, '--traces', '0'], { stdio: ['ignore', 'ignore', 'ignore'] });
  const load = f => readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse);
  const ids = new Set(JSON.parse(readFileSync(`${dir}/personas.json`, 'utf8')).slice(0, regressN).map(p => p.id));
  const base = load(`${dir}/runs.jsonl`).filter(r => ids.has(r.p)), patched = load(`${work}/out/runs.jsonl`);
  const stat = rs => ({ rounds: rs.length, winRate: +(rs.filter(r => r.out === 'win').length / rs.length).toFixed(3), avgT: +(rs.reduce((s, r) => s + r.t, 0) / rs.length).toFixed(2),
    bugRounds: rs.filter(r => r.ev.some(e => ['crash', 'stuck', 'oob', 'nan', 'clip', 'airborne', 'softlock'].includes(e[1]))).length });
  regression = { personas: regressN, shipped: stat(base), patched: stat(patched) };
}
const verdict = !allApplied ? 'patch-did-not-apply' : fixedRounds === rounds.length ? 'fixed' : fixedRounds > 0 ? 'partially-fixed' : 'not-fixed';
const report = { bug: bugId, signature: bug.signature, verdict, applied, rounds: rounds.length, fixedRounds, before, after, regression };
mkdirSync(`${dir}/fixes`, { recursive: true });
writeFileSync(`${dir}/fixes/${bugId}.verify.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ verdict, fixedRounds, rounds: rounds.length, applied, regression }, null, 1));
