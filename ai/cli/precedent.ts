// npx tsx --env-file=.env ai/cli/precedent.ts [--dir data/run-main]
// Re-attaches Tavily precedent to the existing findings.json without re-running Ultra (one Tavily call per finding).
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Findings } from "../../lib/types";
import { attachPrecedent } from "../precedent";

const { values } = parseArgs({ options: { dir: { type: "string", default: "data/run-main" } } });
const path = `${values.dir}/findings.json`;
const before = JSON.parse(readFileSync(path, "utf8")) as Findings;
const after = await attachPrecedent({ ...before, findings: before.findings.map(({ precedent: _old, ...f }) => f) } as Findings);
writeFileSync(path, JSON.stringify(after, null, 1));
for (const f of after.findings) console.error(`[precedent] ${f.title.slice(0, 60)} -> ${(f.precedent ?? []).map((p) => new URL(p.url).hostname).join(", ") || "none"}`);
