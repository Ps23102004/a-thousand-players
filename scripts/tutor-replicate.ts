// Replication runner for Tutorial Director onboarding aids.
// Runs runProphet for each aid's tuningOverrides across multiple seeds.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runProphet } from '../lib/prophet';
import {
  aggregateReplication,
  extractSeedMeasurement,
  type AidReplication,
  type SeedMeasurement,
  type TutorReplicationResults,
} from '../ai/tutor-replication';
import type { TutorResults } from '../ai/tutor';

export interface ReplicateOptions {
  seeds?: number[];
  dryRun?: boolean;
  resultsPath?: string;
  outPath?: string;
}

export function parseSeedList(str: string): number[] {
  const parts = str.split(',').map((s) => parseInt(s.trim(), 10));
  const valid = parts.filter((n) => Number.isFinite(n) && n > 0);
  if (!valid.length) {
    throw new Error(`Invalid seeds specification: "${str}". Expected comma-separated positive integers.`);
  }
  return valid;
}

export async function runReplication({
  seeds = [1, 2, 3, 4, 5, 6, 7, 8],
  dryRun = false,
  resultsPath = join(process.cwd(), 'data/tutor/results.json'),
  outPath = join(process.cwd(), 'data/tutor/replication.json'),
}: ReplicateOptions = {}): Promise<TutorReplicationResults> {
  const rawResults = JSON.parse(readFileSync(resultsPath, 'utf8')) as TutorResults;
  if (!rawResults.aids || !rawResults.aids.length) {
    throw new Error(`No aids found in ${resultsPath}`);
  }

  if (dryRun) {
    console.log(`[dry-run] Tutorial Director Replication Plan:`);
    console.log(`  Input: ${resultsPath}`);
    console.log(`  Output: ${outPath}`);
    console.log(`  Seeds (${seeds.length}): [${seeds.join(', ')}]`);
    console.log(`  Aids to replicate (${rawResults.aids.length}):`);
    for (const [idx, item] of rawResults.aids.entries()) {
      console.log(`    ${idx + 1}. "${item.aid.title}" (${item.aid.archetype})`);
      console.log(`       Overrides: ${JSON.stringify(item.aid.tuningOverrides)}`);
    }
    console.log(`  Total crowd runs: ${rawResults.aids.length * seeds.length} (200 personas, 1 round each, before/after paired)`);
    console.log(`[dry-run] Completed. No simulations run, no files modified.`);
    return { placeholder: true, seeds };
  }

  const t0 = Date.now();
  console.log(`Starting replication of ${rawResults.aids.length} aids across ${seeds.length} seeds: [${seeds.join(', ')}]...`);

  const replicatedAids: AidReplication[] = [];

  for (const [idx, item] of rawResults.aids.entries()) {
    const { aid } = item;
    const aidT0 = Date.now();
    console.log(`\n[Aid ${idx + 1}/${rawResults.aids.length}] "${aid.title}" (${aid.archetype})`);
    console.log(`  Overrides: ${JSON.stringify(aid.tuningOverrides)}`);

    const seedMeasurements: SeedMeasurement[] = [];
    for (const seed of seeds) {
      console.log(`  Running seed ${seed}...`);
      const result = await runProphet(aid.tuningOverrides, { seed });
      const measurement = extractSeedMeasurement(result);
      seedMeasurements.push(measurement);
      console.log(
        `    Seed ${seed}: overall ${measurement.overallBefore} -> ${measurement.overallAfter} (${measurement.overallDiff! >= 0 ? '+' : ''}${measurement.overallDiff}), casual ${measurement.casualBefore} -> ${measurement.casualAfter} (${measurement.casualDiff! >= 0 ? '+' : ''}${measurement.casualDiff})`
      );
    }

    const aidReplication = aggregateReplication({
      aidTitle: aid.title,
      archetype: aid.archetype,
      tuningOverrides: aid.tuningOverrides,
      seeds: seedMeasurements,
      wallMs: Date.now() - aidT0,
    });

    replicatedAids.push(aidReplication);
    console.log(`  Summary:`);
    console.log(`    Mean diff: ${aidReplication.meanDiff >= 0 ? '+' : ''}${aidReplication.meanDiff.toFixed(2)} wins (range: ${aidReplication.minDiff} to ${aidReplication.maxDiff})`);
    console.log(`    95% CI (t-based): [${aidReplication.interval.lower.toFixed(2)}, ${aidReplication.interval.upper.toFixed(2)}]`);
    console.log(`    Sign summary: ${aidReplication.signSummary}`);
    console.log(`    Verdict: ${aidReplication.verdict}`);
  }

  const wallMs = Date.now() - t0;
  const results: TutorReplicationResults = {
    placeholder: false,
    seeds,
    wallMs,
    generatedAt: new Date().toISOString(),
    aids: replicatedAids,
  };

  writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nReplication complete in ${(wallMs / 1000).toFixed(2)} s.`);
  console.log(`Wrote replication data to ${outPath}`);

  return results;
}

// CLI entrypoint
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'seeds': { type: 'string', default: '1,2,3,4,5,6,7,8' },
    },
    strict: false,
    allowPositionals: true,
  });

  const seeds = parseSeedList(values.seeds ?? '1,2,3,4,5,6,7,8');
  const dryRun = Boolean(values['dry-run']);

  runReplication({ seeds, dryRun }).catch((err) => {
    console.error('Replication failed:', err);
    process.exit(1);
  });
}
