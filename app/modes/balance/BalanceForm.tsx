"use client";
import AiForm from "@/components/AiForm";
import type { Tuning, TuningSpec } from "@/lib/types";
import Prophet from "./Prophet";

export default function BalanceForm({ baseline }: { baseline: TuningSpec[] }) {
  return (
    <AiForm<{ tuning: Tuning; rationale: string }>
      endpoint="/api/balance" field="notes" label="Patch notes" cta="Translate to tuning"
      placeholder="Write the patch notes you are thinking of shipping."
      example="Sweep is too strong: make it slower to recover and a bit weaker. Blocking should chip a little more damage."
      render={({ tuning, rationale }) => {
        const changed = Object.entries(tuning);
        return (
          <div className="panel">
            <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Tuning changes</h2>
            <p style={{ marginBottom: 16 }}>{rationale}</p>
            {changed.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Constant</th><th className="num">Before</th><th className="num">After</th><th className="num">Change</th><th className="num">Allowed</th></tr></thead>
                  <tbody>
                    {changed.map(([key, after]) => {
                      const spec = baseline.find((s) => s.key === key);
                      const before = spec?.default;
                      const delta = before ? `${after >= before ? "+" : ""}${Math.round(((after - before) / before) * 100)}%` : "new";
                      return (
                        <tr key={key}>
                          <td><code>{key}</code>{spec && <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{spec.description}</div>}</td>
                          <td className="num">{before ?? "?"}</td>
                          <td className="num" style={{ color: "var(--accent)" }}>{after}</td>
                          <td className="num">{delta}</td>
                          <td className="num">{spec ? `${spec.min} to ${spec.max}` : "unknown key"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="notice">The model proposed no changes.</p>}
            <details><summary>Raw JSON</summary><pre>{JSON.stringify({ tuning, rationale }, null, 2)}</pre></details>
            {changed.length > 0 && <Prophet key={JSON.stringify(tuning)} tuning={tuning} />}
          </div>
        );
      }}
    />
  );
}
