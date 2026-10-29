import assert from "node:assert/strict";
import { test } from "node:test";
import type { VerifiedDriftClaim } from "../../../ai/drift";
import { groupDriftClaims } from "./grouping";

const claims: VerifiedDriftClaim[] = Array.from({ length: 5 }, (_, index) => ({
  docClaim: `Fixture quote ${index + 1}`,
  docFile: "docs/design.md",
  codeSymbol: `fixture${index + 1}`,
  codeFile: "game/src/ai.js",
  codeLine: index + 1,
  codeLineText: `const fixture${index + 1} = true;`,
  whatCodeDoes: "Fixture proposal, not a finding.",
  severity: "low",
}));

const judge = {
  judge: "fixture judge, not a model call",
  verdicts: {
    "1": { verdict: "NOT_DRIFT", reason: "Fixture disagreement." },
    "2": { verdict: "REAL_DRIFT", reason: "Fixture confirmation." },
    "3": { verdict: "DOC_VAGUE", reason: "Fixture wording ambiguity." },
    "4": { verdict: "REAL_DRIFT", reason: "Another fixture confirmation." },
  },
};

test("groups a fixture by the original 1-based claim position, preserving reasons and order", () => {
  const result = groupDriftClaims(claims, judge);
  assert.deepEqual(result.confirmed.map(item => item.index), [2, 4]);
  assert.deepEqual(result.vague.map(item => item.index), [3]);
  assert.deepEqual(result.notDrift.map(item => item.index), [1]);
  assert.deepEqual(result.unchecked.map(item => item.index), [5]);
  assert.equal(result.confirmed[0].claim, claims[1]);
  assert.deepEqual(result.confirmed[0].judgment, judge.verdicts["2"]);
  assert.equal(result.unchecked[0].judgment, undefined);
  assert.deepEqual(result.counts, { total: 5, confirmed: 2, vague: 1, notDrift: 1, unchecked: 1 });
});

test("missing judge data leaves every claim not second-checked", () => {
  for (const absent of [undefined, null, {}]) {
    const result = groupDriftClaims(claims, absent);
    assert.deepEqual(result.counts, { total: 5, confirmed: 0, vague: 0, notDrift: 0, unchecked: 5 });
    assert.deepEqual(result.unchecked.map(item => item.index), [1, 2, 3, 4, 5]);
  }
});

test("ignores orphan verdicts and does not count invalid verdicts as disagreements", () => {
  const result = groupDriftClaims(claims, {
    verdicts: {
      ...judge.verdicts,
      "0": { verdict: "REAL_DRIFT", reason: "Not a 1-based claim index." },
      "5": { verdict: "UNKNOWN", reason: "Not a supported verdict." },
      "6": { verdict: "REAL_DRIFT", reason: "No sixth claim exists." },
    },
  });
  assert.deepEqual(result.counts, { total: 5, confirmed: 2, vague: 1, notDrift: 1, unchecked: 1 });
});

test("empty claims produce empty groups and zero counts even when judgments exist", () => {
  assert.deepEqual(groupDriftClaims([], judge), {
    confirmed: [], vague: [], notDrift: [], unchecked: [],
    counts: { total: 0, confirmed: 0, vague: 0, notDrift: 0, unchecked: 0 },
  });
});
