import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { createRequire } from 'node:module';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: React.ReactNode) => string };

import {
  aggregateReplication,
  computeVerdict,
  calculatePairedStats,
  type SeedMeasurement,
  type AidReplication,
  type TutorReplicationResults,
} from './tutor-replication';
import { TutorContent } from '../app/modes/onboarding/results';
import type { TutorResults } from './tutor';

test('aggregation math matches hard-coded numbers (clear gain)', () => {
  // 8 seeds with hand-calculated overall diffs: [9, 8, 7, 10, 6, 9, 8, 7]
  // Sum = 64, Mean = 8.0, Min = 6, Max = 10
  // Sum of squared deviations = 12, df = 7
  // s^2 = 12/7, s = sqrt(12/7) = 1.309307...
  // SE = sqrt(12/56) = 0.462910...
  // t(7, 0.975) = 2.364624 -> ME = 1.094608
  // Lower CI = 6.905392, Upper CI = 9.094608
  const seeds: SeedMeasurement[] = [
    { seed: 1, overallBefore: 66, overallAfter: 75, casualBefore: 5, casualAfter: 9 },
    { seed: 2, overallBefore: 60, overallAfter: 68, casualBefore: 4, casualAfter: 8 },
    { seed: 3, overallBefore: 70, overallAfter: 77, casualBefore: 6, casualAfter: 10 },
    { seed: 4, overallBefore: 65, overallAfter: 75, casualBefore: 5, casualAfter: 9 },
    { seed: 5, overallBefore: 68, overallAfter: 74, casualBefore: 7, casualAfter: 10 },
    { seed: 6, overallBefore: 62, overallAfter: 71, casualBefore: 5, casualAfter: 8 },
    { seed: 7, overallBefore: 64, overallAfter: 72, casualBefore: 6, casualAfter: 9 },
    { seed: 8, overallBefore: 67, overallAfter: 74, casualBefore: 5, casualAfter: 9 },
  ];

  const res = aggregateReplication({
    aidTitle: 'Master Your First Combo',
    archetype: 'casual',
    tuningOverrides: { 'anim.JAB.damage': 15 },
    seeds,
  });

  // Verify per-seed diffs
  assert.equal(res.seeds[0].overallDiff, 9);
  assert.equal(res.seeds[0].casualDiff, 4);
  assert.equal(res.seeds[4].overallDiff, 6);
  assert.equal(res.seeds[4].casualDiff, 3);

  // Hard-coded summary statistics
  assert.equal(res.meanDiff, 8.0);
  assert.equal(res.minDiff, 6);
  assert.equal(res.maxDiff, 10);
  assert.equal(res.improved, 8);
  assert.equal(res.tied, 0);
  assert.equal(res.worsened, 0);
  assert.equal(res.signSummary, '+8 / =0 / -0');

  // Hard-coded interval check: 8.0 +/- 1.094608
  assert.ok(Math.abs(res.interval.lower - 6.905392) < 0.005, `Expected lower ~6.905, got ${res.interval.lower}`);
  assert.ok(Math.abs(res.interval.upper - 9.094608) < 0.005, `Expected upper ~9.095, got ${res.interval.upper}`);
  assert.equal(res.interval.method, 't-based');
  assert.equal(res.interval.confidence, 0.95);

  // Verdict
  assert.equal(res.verdict, 'clear gain');
});

test('aggregation math matches hard-coded numbers (noisy results)', () => {
  // Diffs: [3, -2, 0, 1, -1, 2, -3, 1]
  // Sum = 1, Mean = 0.125, Min = -3, Max = 3
  // Improved = 4, Tied = 1, Worsened = 3
  // Sum of squared dev = 28.875, s^2 = 4.125, SE = sqrt(0.515625) = 0.718070...
  // ME = 2.364624 * 0.718070 = 1.697966
  // Lower CI = 0.125 - 1.697966 = -1.572966
  // Upper CI = 0.125 + 1.697966 = 1.822966
  const seeds: SeedMeasurement[] = [
    { seed: 1, overallBefore: 66, overallAfter: 69, casualBefore: 5, casualAfter: 6 },
    { seed: 2, overallBefore: 66, overallAfter: 64, casualBefore: 5, casualAfter: 4 },
    { seed: 3, overallBefore: 66, overallAfter: 66, casualBefore: 5, casualAfter: 5 },
    { seed: 4, overallBefore: 66, overallAfter: 67, casualBefore: 5, casualAfter: 6 },
    { seed: 5, overallBefore: 66, overallAfter: 65, casualBefore: 5, casualAfter: 4 },
    { seed: 6, overallBefore: 66, overallAfter: 68, casualBefore: 5, casualAfter: 7 },
    { seed: 7, overallBefore: 66, overallAfter: 63, casualBefore: 5, casualAfter: 3 },
    { seed: 8, overallBefore: 66, overallAfter: 67, casualBefore: 5, casualAfter: 6 },
  ];

  const res = aggregateReplication({
    aidTitle: 'Practice Sidestepping',
    archetype: 'casual',
    tuningOverrides: { 'anim.JAB.reach': 1.3 },
    seeds,
  });

  assert.equal(res.meanDiff, 0.125);
  assert.equal(res.minDiff, -3);
  assert.equal(res.maxDiff, 3);
  assert.equal(res.improved, 4);
  assert.equal(res.tied, 1);
  assert.equal(res.worsened, 3);
  assert.equal(res.signSummary, '+4 / =1 / -3');

  assert.ok(Math.abs(res.interval.lower - (-1.572966)) < 0.005);
  assert.ok(Math.abs(res.interval.upper - 1.822966) < 0.005);
  assert.equal(res.verdict, 'not distinguishable from noise');
});

test('aggregation math matches hard-coded numbers (clear loss)', () => {
  // Diffs: [-8, -7, -9, -8, -6, -8, -7, -9]
  // Sum = -62, Mean = -7.75, Min = -9, Max = -6
  // Improved = 0, Tied = 0, Worsened = 8
  // Sum of squares = 7.5, s^2 = 7.5/7, SE = sqrt(7.5/56) = 0.365963...
  // ME = 2.364624 * 0.365963 = 0.865360
  // Lower CI = -7.75 - 0.865360 = -8.615360
  // Upper CI = -7.75 + 0.865360 = -6.884640
  const seeds: SeedMeasurement[] = [
    { seed: 1, overallBefore: 66, overallAfter: 58, casualBefore: 5, casualAfter: 2 },
    { seed: 2, overallBefore: 66, overallAfter: 59, casualBefore: 5, casualAfter: 2 },
    { seed: 3, overallBefore: 66, overallAfter: 57, casualBefore: 5, casualAfter: 1 },
    { seed: 4, overallBefore: 66, overallAfter: 58, casualBefore: 5, casualAfter: 2 },
    { seed: 5, overallBefore: 66, overallAfter: 60, casualBefore: 5, casualAfter: 3 },
    { seed: 6, overallBefore: 66, overallAfter: 58, casualBefore: 5, casualAfter: 2 },
    { seed: 7, overallBefore: 66, overallAfter: 59, casualBefore: 5, casualAfter: 2 },
    { seed: 8, overallBefore: 66, overallAfter: 57, casualBefore: 5, casualAfter: 1 },
  ];

  const res = aggregateReplication({
    aidTitle: 'Bad Aid',
    archetype: 'casual',
    tuningOverrides: { 'anim.JAB.startup': 0.5 },
    seeds,
  });

  assert.equal(res.meanDiff, -7.75);
  assert.equal(res.minDiff, -9);
  assert.equal(res.maxDiff, -6);
  assert.equal(res.improved, 0);
  assert.equal(res.tied, 0);
  assert.equal(res.worsened, 8);
  assert.equal(res.signSummary, '+0 / =0 / -8');

  assert.ok(Math.abs(res.interval.lower - (-8.615360)) < 0.005);
  assert.ok(Math.abs(res.interval.upper - (-6.884640)) < 0.005);
  assert.equal(res.verdict, 'clear loss');
});

test('verdict rule boundary conditions', () => {
  // Clear gain boundaries: lower > 0 AND improved >= 7 (of 8)
  assert.equal(
    computeVerdict({ lower: 0.01, upper: 2.0, improved: 7, worsened: 0, totalSeeds: 8 }),
    'clear gain'
  );
  assert.equal(
    computeVerdict({ lower: 0.01, upper: 2.0, improved: 8, worsened: 0, totalSeeds: 8 }),
    'clear gain'
  );
  // Boundary: only 6 improved (less than 7 of 8) -> noise
  assert.equal(
    computeVerdict({ lower: 0.01, upper: 2.0, improved: 6, worsened: 0, totalSeeds: 8 }),
    'not distinguishable from noise'
  );
  // Boundary: lower interval is exactly 0 -> not entirely above 0
  assert.equal(
    computeVerdict({ lower: 0.0, upper: 2.0, improved: 7, worsened: 0, totalSeeds: 8 }),
    'not distinguishable from noise'
  );
  // Boundary: lower interval is negative -> noise
  assert.equal(
    computeVerdict({ lower: -0.01, upper: 2.0, improved: 8, worsened: 0, totalSeeds: 8 }),
    'not distinguishable from noise'
  );

  // Clear loss boundaries: upper < 0 AND worsened >= 7 (of 8)
  assert.equal(
    computeVerdict({ lower: -2.0, upper: -0.01, improved: 0, worsened: 7, totalSeeds: 8 }),
    'clear loss'
  );
  assert.equal(
    computeVerdict({ lower: -2.0, upper: -0.01, improved: 0, worsened: 8, totalSeeds: 8 }),
    'clear loss'
  );
  // Boundary: only 6 worsened -> noise
  assert.equal(
    computeVerdict({ lower: -2.0, upper: -0.01, improved: 0, worsened: 6, totalSeeds: 8 }),
    'not distinguishable from noise'
  );
  // Boundary: upper interval is exactly 0 -> not entirely below 0
  assert.equal(
    computeVerdict({ lower: -2.0, upper: 0.0, improved: 0, worsened: 7, totalSeeds: 8 }),
    'not distinguishable from noise'
  );
  // Boundary: upper interval is positive -> noise
  assert.equal(
    computeVerdict({ lower: -2.0, upper: 0.01, improved: 0, worsened: 8, totalSeeds: 8 }),
    'not distinguishable from noise'
  );

  // Completely tied
  assert.equal(
    computeVerdict({ lower: 0.0, upper: 0.0, improved: 0, worsened: 0, totalSeeds: 8 }),
    'not distinguishable from noise'
  );
});

test('page rendering for both states: placeholder vs replicated', () => {
  const table = [
    {
      archetype: 'casual',
      players: 200,
      rounds: 400,
      wins: 20,
      winRate: 0.05,
      quits: 190,
      quitRate: 0.95,
      round2Count: 150,
      medianRound2Seconds: 10.0,
    },
  ];
  const side = {
    rounds: 200,
    wins: 66,
    winRate: 0.33,
    bugRounds: 1,
    byArchetype: [{ archetype: 'casual', rounds: 39, wins: 5, winRate: 5 / 39, bugRounds: 0 }],
  };
  const tutorData: TutorResults = {
    placeholder: false,
    source: 'model',
    struggleTable: table,
    aids: [
      {
        aid: {
          title: 'Master Your First Combo',
          playerFacingText: 'Tap J four times quickly.',
          rationale: 'Casual players struggle.',
          archetype: 'casual',
          tuningOverrides: { 'anim.JAB.damage': 15 },
        },
        measurement: {
          tuning: { 'anim.JAB.damage': 15 },
          baselineTuning: {},
          personas: 200,
          roundsEach: 1,
          seed: 1,
          before: side,
          after: { ...side, wins: 75, winRate: 75 / 200 },
          wallMs: 12000,
        },
      },
    ],
  };

  // State 1: replication placeholder
  const placeholderReplication: TutorReplicationResults = { placeholder: true };
  const htmlPlaceholder = renderToStaticMarkup(
    createElement(TutorContent, { data: tutorData, replication: placeholderReplication })
  );
  // Must render placeholder state "not run yet"
  assert.match(htmlPlaceholder, /not run yet/i);
  // Must render honest caveat: still round 1 only, quit model not re-simulated, no real new players
  assert.match(htmlPlaceholder, /still round 1 only/i);
  assert.match(htmlPlaceholder, /quit model not re-simulated/i);
  assert.match(htmlPlaceholder, /no real new players/i);

  // State 2: replicated results
  const measuredReplication: TutorReplicationResults = {
    placeholder: false,
    seeds: [1, 2, 3, 4, 5, 6, 7, 8],
    wallMs: 95000,
    aids: [
      {
        aidTitle: 'Master Your First Combo',
        tuningOverrides: { 'anim.JAB.damage': 15 },
        archetype: 'casual',
        seeds: [
          {
            seed: 1,
            overallBefore: 66,
            overallAfter: 75,
            overallDiff: 9,
            casualBefore: 5,
            casualAfter: 9,
            casualDiff: 4,
            overallRounds: 200,
            casualRounds: 39,
          },
        ],
        meanDiff: 8.0,
        minDiff: 6,
        maxDiff: 10,
        improved: 8,
        tied: 0,
        worsened: 0,
        signSummary: '+8 / =0 / -0',
        interval: { method: 't-based', confidence: 0.95, lower: 6.91, upper: 9.09, df: 7 },
        verdict: 'clear gain',
      },
    ],
  };

  const htmlReplicated = renderToStaticMarkup(
    createElement(TutorContent, { data: tutorData, replication: measuredReplication })
  );

  // Must render replication table columns/values:
  // mean paired difference, interval, seeds improved/tied/worsened, verdict
  assert.match(htmlReplicated, /\+8\.0/); // mean paired difference
  assert.match(htmlReplicated, /6\.91/);  // interval lower
  assert.match(htmlReplicated, /9\.09/);  // interval upper
  assert.match(htmlReplicated, /\+8 \/ =0 \/ -0/); // sign summary
  assert.match(htmlReplicated, /clear gain/);      // verdict
  // And the honest caveat must still be present
  assert.match(htmlReplicated, /still round 1 only/i);
  assert.match(htmlReplicated, /quit model not re-simulated/i);
  assert.match(htmlReplicated, /no real new players/i);
});
