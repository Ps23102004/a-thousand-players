import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);

test("the static snapshot loader tolerates an absent file and reads a present fixture", () => {
  const scratch = mkdtempSync(join(tmpdir(), "sparring-drift-judge-"));
  try {
    const directory = join(scratch, "app/modes/drift");
    mkdirSync(directory, { recursive: true });
    const loader = join(directory, "judge.cjs");
    writeFileSync(loader, readFileSync(new URL("./judge.cjs", import.meta.url)));
    const { loadStoredJudge } = require(loader);
    assert.equal(loadStoredJudge(), undefined);

    mkdirSync(join(scratch, "data/drift"), { recursive: true });
    const fixture = { judge: "Fixture judge", verdicts: { "1": { verdict: "REAL_DRIFT", reason: "Fixture reason." } } };
    writeFileSync(join(scratch, "data/drift/judge.json"), JSON.stringify(fixture));
    assert.deepEqual(loadStoredJudge(), fixture);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
