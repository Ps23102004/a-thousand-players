"use client";
import AiForm from "@/components/AiForm";
import type { Oracle, OracleAtom } from "@/lib/types";

const who = (w?: 0 | 1) => (w === 0 ? "the player" : w === 1 ? "the rival" : "either fighter");
function describe(a: OracleAtom): string {
  const parts = [`${a.event.replace(/_/g, " ")} by ${who(a.who)}`];
  if (a.arg) parts.push(`with ${a.arg}`);
  if (a.minCount && a.minCount > 1) parts.push(`at least ${a.minCount} times`);
  if (a.minDuration) parts.push(`lasting ${a.minDuration}s or more`);
  if (a.withinSeconds) parts.push(`between ${a.withinSeconds[0]}s and ${a.withinSeconds[1]}s`);
  return parts.join(" ");
}

export default function ReproForm() {
  return (
    <AiForm<Oracle>
      endpoint="/api/repro" field="report" label="Bug report" cta="Write the oracle"
      placeholder="Describe what went wrong, the way a player would."
      example="My guy got stuck blocking after I got knocked down near the wall and couldn't do anything for like 3 seconds."
      render={(o) => (
        <div className="panel">
          <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Oracle</h2>
          <p style={{ marginBottom: 12 }}>{o.description}</p>
          <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 8 }}>
            A round reproduces the bug when {o.combine === "all" ? "all" : "any"} of these hold:
          </p>
          <ol style={{ margin: "0 0 16px", paddingLeft: 20 }}>{o.atoms.map((a, i) => <li key={i}>{describe(a)}</li>)}</ol>
          <details><summary>Raw JSON</summary><pre>{JSON.stringify(o, null, 2)}</pre></details>
        </div>
      )}
    />
  );
}
