import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TuningSpec } from "@/lib/types";
import BalanceForm from "./BalanceForm";

export const metadata: Metadata = { title: "Balance mode · A Thousand Players" };

export default function BalancePage() {
  const baseline: TuningSpec[] = JSON.parse(readFileSync(join(process.cwd(), "data/baseline-tuning.json"), "utf8"));
  return (
    <section className="section wrap" aria-labelledby="balance-title">
      <div className="kicker">Mode · Balance</div>
      <h1 id="balance-title" style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", margin: "10px 0 16px" }}>If you ship this patch, what changes?</h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        Nemotron Super turns patch notes into concrete tuning values, checked against the game&apos;s allowed ranges.
        The same crowd then replays with the new values so you can compare before and after.
      </p>
      <BalanceForm baseline={baseline} />
    </section>
  );
}
