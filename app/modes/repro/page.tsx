import type { Metadata } from "next";
import ReproForm from "./ReproForm";

export const metadata: Metadata = { title: "Repro mode · A Thousand Players" };

export default function ReproPage() {
  return (
    <section className="section wrap" aria-labelledby="repro-title">
      <div className="kicker">Mode · Repro</div>
      <h1 id="repro-title" style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", margin: "10px 0 16px" }}>Turn a bug report into a replay.</h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        Nemotron Super reads a player&apos;s bug report and writes an oracle: exact conditions over engine events that the crowd can test every round against.
        Rounds that trip the oracle become replayable reproductions.
      </p>
      <ReproForm />
    </section>
  );
}
