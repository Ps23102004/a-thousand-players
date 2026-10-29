import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Vercel Hobby allows 12 serverless functions per deployment. force-dynamic in the root layout turned all 9 pages into
// functions (15 in total). The recorded data is baked into the build, so pages are static; only the API routes and /replay
// (reads searchParams) stay dynamic.
test("root layout does not force every page to render per request", () => {
  const src = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /export const dynamic\s*=\s*"force-dynamic"/);
});
