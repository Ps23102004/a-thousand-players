// Recorded real answers for the built-in examples (data/samples/<name>.json), used only when the rate limit is reached.
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sample } from "./ai-route";

export function loadSample(name: "repro" | "balance"): Sample | null {
  const path = join(process.cwd(), "data/samples", `${name}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Sample) : null;
}
