import type { UsageRow } from "@/lib/types";
import type { UsageFile } from "@/lib/web-types";

const ROLES: { name: string; match: RegExp; id: string; role: string }[] = [
  { name: "Nemotron Nano", match: /nano/i, id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", role: "Writes every persona's policy in bulk and proposes exploit strategies. Can also pick each action for a spotlight player (implemented, not in the main run)." },
  { name: "Nemotron Super", match: /super(?!.*vl)/i, id: "nvidia/nemotron-3-super-120b-a12b", role: "Turns English into things the engine runs: bug reports into oracles, patch notes into tuning." },
  { name: "Nemotron Super-VL", match: /vl/i, id: "nvidia/Nemotron-3.5-Super-VL", role: "Describes replay frames in the Eyes panel. A description aid only: on the one bug round tried it missed the floating fighter." },
  { name: "Nemotron Ultra", match: /ultra/i, id: "nvidia/Nemotron-3-Ultra-550b-a55b", role: "Reads every play log in one long-context call and writes the findings, citing seeds." },
  { name: "Tavily", match: /tavily/i, id: "web search API", role: "Finds related developer writeups: offline for each finding, and live from the Find precedent button on Repro." },
];
const n = (v: number) => v.toLocaleString("en-US");

export default function ModelPanel({ usage }: { usage: UsageFile | null }) {
  const rows = usage?.usage ?? [];
  // A usage row that matches no known role still gets a card, so the panel always lists every row in usage.json.
  const cards: { name: string; id: string; role: string; u: UsageRow[] }[] = [
    ...ROLES.map((r) => ({ ...r, u: rows.filter((x) => r.match.test(x.model)) })),
    ...rows.filter((x) => !ROLES.some((r) => r.match.test(x.model)))
      .map((x) => ({ name: x.model.split("/").pop() ?? x.model, id: x.model, role: "Other model used in this run.", u: [x] })),
  ];
  return (
    <>
      <div className="grid-3">
        {cards.map((r) => {
          const u = r.u;
          const sum = (k: "calls" | "tokensIn" | "tokensOut" | "usdEstimate") => u.reduce((s, x) => s + x[k], 0);
          const usd = sum("usdEstimate");
          return (
            <section key={r.name} className="panel model" style={{ borderTopColor: u.length ? "var(--accent)" : "var(--line)" }}>
              <h3 className="model-name">{r.name}</h3>
              <div className="model-id">{u[0]?.model ?? r.id}</div>
              <p className="model-role">{r.role}</p>
              {u.length ? (
                <dl className="model-stats">
                  <dt>calls</dt><dd>{n(sum("calls"))}</dd>
                  {r.name !== "Tavily" && <><dt>tokens in</dt><dd>{n(sum("tokensIn"))}</dd><dt>tokens out</dt><dd>{n(sum("tokensOut"))}</dd></>}
                  {usd > 0 ? <><dt>cost estimate</dt><dd>~${usd.toFixed(2)} (estimate)</dd></> : r.name !== "Tavily" && <><dt>cost</dt><dd>not priced</dd></>}
                </dl>
              ) : <p className="model-stats">Not part of the recorded run. It runs live in the app ({r.name === "Tavily" ? "Find precedent on Repro" : "the Eyes panel on a replay"}), and live calls are not logged here.</p>}
            </section>
          );
        })}
      </div>
      <p className="lede" style={{ marginTop: 14, fontSize: "0.85rem" }}>
        {usage?.notes ? `${usage.notes} ` : ""}Token counts come from the API responses. Prices are unverified, so no dollar figure is shown except where a row carries an estimate.
      </p>
    </>
  );
}
