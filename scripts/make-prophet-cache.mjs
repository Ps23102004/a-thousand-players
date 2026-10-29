// Offline only. Uses the recorded Super example; no key, model call or external network.
// node scripts/make-prophet-cache.mjs [--seed 1] [--limit 200]
import { register } from 'tsx/esm/api';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
register();
const { runProphet } = await import('../lib/prophet.ts');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : Number(process.argv[i + 1]); };
const seed = arg('seed', 1), limit = arg('limit', 200);
if (!Number.isSafeInteger(seed) || seed < 1 || ![100, 200].includes(limit)) throw new Error('use a positive integer seed and --limit 100 or 200');
const { tuning } = JSON.parse(readFileSync('data/samples/balance.json', 'utf8')).response;
const result = await runProphet(tuning, { seed, limit });
mkdirSync('data/prophet', { recursive: true });
const path = seed === 1 ? 'data/prophet/example.json' : `data/prophet/seed-${seed}.json`;
writeFileSync(path, JSON.stringify({ ...result, generatedAt: new Date().toISOString(), command: `node scripts/make-prophet-cache.mjs --seed ${seed} --limit ${limit}` }, null, 2) + '\n');
console.log(JSON.stringify({ path, wallMs: result.wallMs, projected3xMs: result.wallMs * 3, personas: result.personas, before: result.before, after: result.after }, null, 2));
