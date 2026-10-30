// Prints a plain summary of black-box reports in a folder: node scripts/summarize-realgames.mjs <dir>
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const lines = ["# Black-box run on real open-source games", ""];
for (const g of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const f = join(dir, g, "report.json");
  if (!existsSync(f)) { lines.push(`## ${g}`, "no report.json (run did not finish)", ""); continue; }
  const r = JSON.parse(readFileSync(f, "utf8"));
  lines.push(`## ${g}`, `- status: ${r.status}; controls: ${r.controls}; frames: ${r.frames?.length ?? 0}; idle animation seen: ${r.animationEvidence}`);
  lines.push(`- startup clicks: ${(r.startupClicks ?? []).map((c) => `${c.text} (${c.status})`).join(", ") || "none"}`);
  const fs = r.findings ?? [];
  lines.push(`- findings: ${fs.length ? fs.map((x) => `${x.kind}${x.confidence ? ` [${x.confidence}]` : ""}: ${String(x.message ?? x.detail ?? "").slice(0, 140)}`).join(" | ") : "none"}`);
  const env = r.environment ?? [];
  lines.push(`- environment notes (not game bugs): ${env.length}${env.length ? ` e.g. ${String(env[0].message ?? env[0].kind ?? JSON.stringify(env[0])).slice(0, 120)}` : ""}`, "");
}
console.log(lines.join("\n"));
