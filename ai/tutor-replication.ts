import type { ProphetResult } from '../lib/prophet';
import type { Tuning } from '../lib/types';

export interface SeedMeasurement {
  seed: number;
  overallBefore: number;
  overallAfter: number;
  overallDiff?: number;
  casualBefore: number;
  casualAfter: number;
  casualDiff?: number;
  overallRounds?: number;
  casualRounds?: number;
}

export interface SeedResult extends SeedMeasurement {
  overallDiff: number;
  casualDiff: number;
}

export interface ReplicationInterval {
  method: 't-based';
  confidence: number;
  lower: number;
  upper: number;
  df?: number;
}

export type Verdict = 'clear gain' | 'clear loss' | 'not distinguishable from noise';

export interface AidReplication {
  aidTitle: string;
  tuningOverrides: Tuning;
  archetype: string;
  seeds: SeedResult[];
  meanDiff: number;
  minDiff: number;
  maxDiff: number;
  improved: number;
  tied: number;
  worsened: number;
  signSummary: string;
  interval: ReplicationInterval;
  verdict: Verdict;
  wallMs?: number;
}

export interface TutorReplicationResults {
  placeholder: boolean;
  seeds?: number[];
  wallMs?: number;
  aids?: AidReplication[];
  generatedAt?: string;
}

// Two-sided critical values for t-distribution at 95% confidence level (alpha = 0.05)
const T_CRITICAL_95: Record<number, number> = {
  1: 12.706205,
  2: 4.302653,
  3: 3.182446,
  4: 2.776445,
  5: 2.570582,
  6: 2.446912,
  7: 2.364624, // 8 seeds -> df = 7
  8: 2.306004,
  9: 2.262157,
  10: 2.228139,
  11: 2.200985,
  12: 2.178813,
  13: 2.160369,
  14: 2.144787,
  15: 2.131450,
  16: 2.119905,
  17: 2.109816,
  18: 2.100922,
  19: 2.093024,
  20: 2.085963,
  21: 2.079614,
  22: 2.073873,
  23: 2.068658,
  24: 2.063899,
  25: 2.059539,
  26: 2.055529,
  27: 2.051831,
  28: 2.048407,
  29: 2.045230,
  30: 2.042272,
};

export function getTCritical95(df: number): number {
  if (df <= 0) return 0;
  if (T_CRITICAL_95[df]) return T_CRITICAL_95[df];
  // Normal distribution approximation for df > 30
  return 1.95996 + 2.372 / df + 2.82 / (df * df);
}

export function calculatePairedStats(diffs: number[], confidence = 0.95): {
  meanDiff: number;
  minDiff: number;
  maxDiff: number;
  improved: number;
  tied: number;
  worsened: number;
  signSummary: string;
  interval: ReplicationInterval;
} {
  const n = diffs.length;
  if (n === 0) {
    return {
      meanDiff: 0,
      minDiff: 0,
      maxDiff: 0,
      improved: 0,
      tied: 0,
      worsened: 0,
      signSummary: '+0 / =0 / -0',
      interval: { method: 't-based', confidence, lower: 0, upper: 0, df: 0 },
    };
  }

  const sum = diffs.reduce((a, b) => a + b, 0);
  const meanDiff = sum / n;
  const minDiff = Math.min(...diffs);
  const maxDiff = Math.max(...diffs);

  let improved = 0;
  let tied = 0;
  let worsened = 0;
  for (const d of diffs) {
    if (d > 0) improved++;
    else if (d === 0) tied++;
    else worsened++;
  }

  const signSummary = `+${improved} / =${tied} / -${worsened}`;

  if (n === 1) {
    return {
      meanDiff,
      minDiff,
      maxDiff,
      improved,
      tied,
      worsened,
      signSummary,
      interval: { method: 't-based', confidence, lower: meanDiff, upper: meanDiff, df: 0 },
    };
  }

  const df = n - 1;
  const ss = diffs.reduce((acc, d) => acc + Math.pow(d - meanDiff, 2), 0);
  const sampleVariance = ss / df;
  const standardError = Math.sqrt(sampleVariance / n);
  const tCritical = getTCritical95(df);
  const margin = tCritical * standardError;

  return {
    meanDiff,
    minDiff,
    maxDiff,
    improved,
    tied,
    worsened,
    signSummary,
    interval: {
      method: 't-based',
      confidence,
      lower: meanDiff - margin,
      upper: meanDiff + margin,
      df,
    },
  };
}

export function computeVerdict({
  lower,
  upper,
  improved,
  worsened,
  totalSeeds,
}: {
  lower: number;
  upper: number;
  improved: number;
  worsened: number;
  totalSeeds: number;
}): Verdict {
  // Clear gain: 95% interval entirely above 0 AND at least 7 of 8 seeds improved.
  // For totalSeeds === 8, improved >= 7. For other counts, at least 7/8 ratio.
  const threshold = totalSeeds === 8 ? 7 : Math.ceil(totalSeeds * (7 / 8));

  if (lower > 0 && improved >= threshold) {
    return 'clear gain';
  }
  if (upper < 0 && worsened >= threshold) {
    return 'clear loss';
  }
  return 'not distinguishable from noise';
}

export function aggregateReplication({
  aidTitle,
  archetype,
  tuningOverrides,
  seeds,
  wallMs,
}: {
  aidTitle: string;
  archetype: string;
  tuningOverrides: Tuning;
  seeds: SeedMeasurement[];
  wallMs?: number;
}): AidReplication {
  const seedResults: SeedResult[] = seeds.map((s) => ({
    ...s,
    overallDiff: s.overallAfter - s.overallBefore,
    casualDiff: s.casualAfter - s.casualBefore,
  }));

  const overallDiffs = seedResults.map((s) => s.overallDiff);
  const stats = calculatePairedStats(overallDiffs);
  const verdict = computeVerdict({
    lower: stats.interval.lower,
    upper: stats.interval.upper,
    improved: stats.improved,
    worsened: stats.worsened,
    totalSeeds: seeds.length,
  });

  return {
    aidTitle,
    archetype,
    tuningOverrides,
    seeds: seedResults,
    meanDiff: stats.meanDiff,
    minDiff: stats.minDiff,
    maxDiff: stats.maxDiff,
    improved: stats.improved,
    tied: stats.tied,
    worsened: stats.worsened,
    signSummary: stats.signSummary,
    interval: stats.interval,
    verdict,
    wallMs,
  };
}

export function extractSeedMeasurement(res: ProphetResult): SeedMeasurement {
  const casualBefore = res.before.byArchetype.find((a) => a.archetype === 'casual');
  const casualAfter = res.after.byArchetype.find((a) => a.archetype === 'casual');

  return {
    seed: res.seed,
    overallBefore: res.before.wins,
    overallAfter: res.after.wins,
    overallDiff: res.after.wins - res.before.wins,
    casualBefore: casualBefore?.wins ?? 0,
    casualAfter: casualAfter?.wins ?? 0,
    casualDiff: (casualAfter?.wins ?? 0) - (casualBefore?.wins ?? 0),
    overallRounds: res.before.rounds,
    casualRounds: casualBefore?.rounds ?? 0,
  };
}
