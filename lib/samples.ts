// Recorded real answers for the built-in examples (data/samples/<name>.json), used only when a live call is refused (rate limit or busy).
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sample } from "./ai-route";

export function loadSample(name: "repro" | "balance" | "triage" | "eyes" | "precedent" | "advisor"): Sample | null {
  const path = join(process.cwd(), "data/samples", `${name}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Sample) : null;
}
