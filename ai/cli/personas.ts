// npx tsx --env-file=.env ai/cli/personas.ts --n 1000 --out data/run-main/personas.json
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { generatePersonas, lastPersonaStats } from "../personas";
import { getUsage } from "../usage";

const { values } = parseArgs({ options: { n: { type: "string", default: "1000" }, out: { type: "string", default: "data/run-main/personas.json" }, concurrency: { type: "string", default: "16" }, seed: { type: "string", default: "1" } } });
const n = Number(values.n);
const t0 = Date.now();
const personas = await generatePersonas(n, {
  concurrency: Number(values.concurrency),
  seed: Number(values.seed),
  onProgress: (done, total) => process.stderr.write(`\r[personas] ${done}/${total}`),
});
const secs = (Date.now() - t0) / 1000;
writeFileSync(values.out!, JSON.stringify(personas, null, 1));
const s = lastPersonaStats!;
console.error(`\n[personas] wrote ${personas.length} to ${values.out} in ${secs.toFixed(1)} s`);
console.error(`[personas] first-pass valid ${s.firstPassValid}/${s.requested} (${((100 * s.firstPassValid) / s.requested).toFixed(1)}%), duplicates dropped ${s.duplicatesDropped}, repair rounds ${s.repairRounds}, calls ${s.calls}`);
console.error(`[personas] usage ${JSON.stringify(getUsage())}`);
