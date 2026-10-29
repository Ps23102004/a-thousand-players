import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import type { VerifiedDriftClaim } from "../../../ai/drift";
import { DriftClaimGroups } from "./results";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");

const claims: VerifiedDriftClaim[] = [1, 2, 3, 4].map(index => ({
  docClaim: `Fixture quote ${index}`, docFile: "docs/design.md", codeSymbol: `fixture${index}`,
  codeFile: "game/src/ai.js", codeLine: index, codeLineText: "// Fixture only",
  whatCodeDoes: "Fixture proposal.", severity: "low",
}));

test("static markup presents computed counts, ordered groups, reasons and closed disagreements", () => {
  const html = renderToStaticMarkup(<DriftClaimGroups claims={claims} judge={{
    judge: "Fixture judge on 2026-10-29",
    verdicts: {
      "1": { verdict: "NOT_DRIFT", reason: "Fixture rejection." },
      "2": { verdict: "DOC_VAGUE", reason: "Fixture ambiguity." },
      "3": { verdict: "REAL_DRIFT", reason: "Fixture confirmation." },
    },
  }} />);
  assert.match(html, /1 of 4 confirmed, 1 vague, 1 not drift; 1 not second-checked/);
  assert.match(html, /Fixture judge on 2026-10-29/);
  assert.match(html, /one second opinion, not ground truth/);
  assert.match(html, /Second-model reason:<\/strong> Fixture confirmation\./);
  const headings = ["Confirmed by a second model", "Doc wording is vague", "Second model disagrees", "Not second-checked"];
  headings.forEach((heading, index) => {
    assert.ok(html.includes(heading));
    if (index) assert.ok(html.indexOf(headings[index - 1]) < html.indexOf(heading));
  });
  assert.match(html, /<details[^>]*data-testid="drift-not-drift"/);
  assert.doesNotMatch(html, /<details[^>]*\bopen[\s=>]/);
  assert.match(html, /Candidate 3: fixture3/);
  assert.match(html, /Candidate 1: fixture1/);
});

test("missing judge renders all original claims with an honest unchecked label", () => {
  const html = renderToStaticMarkup(<DriftClaimGroups claims={claims} />);
  assert.match(html, /0 of 4 confirmed, 0 vague, 0 not drift; 4 not second-checked/);
  assert.match(html, /No second-model snapshot is available/);
  assert.equal((html.match(/<article /g) || []).length, 4);
  assert.equal((html.match(/<strong>not second-checked<\/strong>/g) || []).length, 4);
});
