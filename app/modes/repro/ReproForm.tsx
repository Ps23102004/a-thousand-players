"use client";
import AiForm from "@/components/AiForm";
import type { OracleAtom } from "@/lib/types";
import type { ReproResponse } from "@/lib/web-types";
import MatchRow from "./MatchRow";

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
    <AiForm<ReproResponse>
      endpoint="/api/repro" field="report" label="Bug report" cta="Find it in the crowd"
      placeholder="Describe what went wrong, the way a player would."
      example="My guy floated up in the air while blocking after the other fighter let go of me near the wall, and then he flew out of the arena."
      render={({ oracle: o, total, matched, examples }) => (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel">
            <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Oracle (written by Nemotron Super)</h2>
            <p style={{ marginBottom: 12 }}>{o.description}</p>
            <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 8 }}>
              A round reproduces the bug when {o.combine === "all" ? "all" : "any"} of these hold:
            </p>
            <ol style={{ margin: "0 0 16px", paddingLeft: 20 }}>{o.atoms.map((a, i) => <li key={i}>{describe(a)}</li>)}</ol>
            <details><summary>Raw JSON</summary><pre>{JSON.stringify(o, null, 2)}</pre></details>
          </div>
          <div className="panel">
            <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>
              {matched ? `${matched} of ${total.toLocaleString()} recorded rounds trip this oracle` : `No recorded round trips this oracle (${total.toLocaleString()} checked)`}
            </h2>
            <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 12 }}>
              Plain code, not the model, runs the oracle over the recorded rounds. Zero matches does not prove the bug is absent:
              the crowd may never have reached it, and each round keeps at most 220 events.
              &quot;Triage this&quot; sends one matched round to Nemotron Ultra live (one call, about 20-40 s): it reads a timeline re-simulated from the seed plus the game source and proposes a patch, which code applies to a scratch copy and replays on the same seed.
            </p>
            {examples.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Player</th><th className="num">Round</th><th>Trigger</th><th>Outcome</th><th>Replay / triage</th></tr></thead>
                  <tbody>
                    {examples.map((m) => <MatchRow key={`${m.p}:${m.round}`} m={m} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    />
  );
}
