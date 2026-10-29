import type { Metadata } from "next";
import SourceTag from "@/components/SourceTag";
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
        <SourceTag live="Super turns patch notes into tuning" />
      <h1 id="balance-title" style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", margin: "10px 0 16px" }}>If you ship this patch, what changes?</h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        Nemotron Super turns patch notes into concrete tuning values, checked against the game&apos;s allowed ranges.
        Then run Patch Prophet to compare a small crowd before and after your patch, with the same personas and seeds on both sides.
        Win rates and bug rounds come from the engine. The built-in example has a cached offline result if the server is busy or reaches its limit.
      </p>
      <BalanceForm baseline={baseline} />
    </section>
  );
}
