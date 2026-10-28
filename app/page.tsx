import CrowdGrid from "@/components/CrowdGrid";
import FindingCard from "@/components/FindingCard";
import ModelPanel from "@/components/ModelPanel";
import { ArchetypeBars, DurationHist, KoHeatmap, QuitFunnel } from "@/components/Charts";
import { getData, getTiles } from "@/lib/data";

export default function Home() {
  const { summary: s, traces, findings, usage, source } = getData();
  const tiles = getTiles(64);
  const quitters = (s.quitReasons.frustration ?? 0) + (s.quitReasons.boredom ?? 0);
  const quitPct = s.sessions ? Math.round((quitters / s.sessions) * 100) : 0;

  return (
    <>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="kicker">{source === "fixtures" ? "Sample run" : "Crowd run"} · Market Brawl</div>
        <h1 id="hero-title" style={{ marginTop: 14 }}>A crowd of <em>synthetic players</em> breaks your game so you can fix it.</h1>
        <p className="lede">
          NVIDIA Nemotron models write the players, Market Brawl runs their matches headless, and Nemotron Ultra reads every log at once.
          Every finding below comes with a seed you can replay in the real game.
        </p>
        <div className="counters">
          <div className="counter"><div className="counter-value">{s.players.toLocaleString("en-US")}</div><div className="counter-label">players</div></div>
          <div className="counter"><div className="counter-value">{s.rounds.toLocaleString("en-US")}</div><div className="counter-label">rounds played</div></div>
          <div className="counter"><div className="counter-value">{s.simHours.toFixed(1)}</div><div className="counter-label">simulated hours</div></div>
          <div className="counter"><div className="counter-value">{quitPct}%</div><div className="counter-label">quit (bored or frustrated)</div></div>
        </div>
      </section>

      <section id="crowd" className="section wrap" aria-labelledby="crowd-title">
        <div className="section-head">
          <h2 id="crowd-title">The Crowd</h2>
          <p className="lede">Recorded rounds replaying side by side. Hover for the player, click to open the replay.</p>
        </div>
        <CrowdGrid tiles={tiles} states={traces.states} halfWidth={traces.arenaHalfWidth} mobileCount={48} />
      </section>

      <section className="section wrap" aria-labelledby="evidence-title">
        <div className="section-head">
          <h2 id="evidence-title">The evidence</h2>
          <p className="lede">Aggregates computed by code from every round, not by a model.</p>
        </div>
        <div className="grid-2">
          <div className="panel chart"><h3 style={{ marginBottom: 14 }}>Where knockouts happen</h3><KoHeatmap heat={s.koHeat} /></div>
          <div className="panel chart"><h3 style={{ marginBottom: 14 }}>Who keeps playing</h3><QuitFunnel curve={s.quitCurve} reasons={s.quitReasons} /></div>
          <div className="panel chart"><h3 style={{ marginBottom: 14 }}>Archetypes: win and quit</h3><ArchetypeBars by={s.byArchetype} /></div>
          <div className="panel chart"><h3 style={{ marginBottom: 14 }}>How long rounds last</h3><DurationHist hist={s.durationHist} /></div>
        </div>
      </section>

      <section id="findings" className="section wrap" aria-labelledby="findings-title">
        <div className="section-head">
          <h2 id="findings-title">What Ultra found</h2>
          {findings && (
            <p className="lede mono" style={{ fontSize: "0.8rem" }}>
              {findings.model} · read {findings.corpusTokens.toLocaleString("en-US")} tokens of logs in one call
            </p>
          )}
        </div>
        {findings ? (
          <>
            <p className="lede" style={{ marginBottom: 20, color: "var(--text)" }}>{findings.summary}</p>
            <p className="lede" style={{ marginBottom: 20, fontSize: "0.9rem" }}>
              Green claims were recomputed from the raw runs by code and match within tolerance. Amber claims were not checked or did not match.
            </p>
            <div className="grid-2">{findings.findings.map((f) => <FindingCard key={f.id} f={f} />)}</div>
          </>
        ) : (
          <p className="notice">No findings for this run yet. Ultra has not analyzed it.</p>
        )}
      </section>

      <section className="section wrap" aria-labelledby="models-title">
        <div className="section-head">
          <h2 id="models-title">Who did what</h2>
          <p className="lede">A cheap swarm and one big reader. Each model has one job.</p>
        </div>
        <ModelPanel usage={usage} />
      </section>

      <section className="section wrap" aria-labelledby="limits-title">
        <div className="section-head"><h2 id="limits-title">What this cannot tell you</h2></div>
        <ul className="limits">
          <li><strong>The players are synthetic.</strong>They are decision tables written by a language model, not people. They do not feel anything.</li>
          <li><strong>Quitting is a hypothesis.</strong>Frustration and boredom come from a simple mood model. Use it to decide what to test with humans, not instead of them.</li>
          <li><strong>Sampled, not proven.</strong>A finding means the crowd hit it. No finding does not mean the bug or exploit is absent.</li>
          <li><strong>Only the policy players are cheap.</strong>The crowd runs compiled policies, not a model call per move. A live spotlight player that Nano drives move by move is implemented and measured, but it is not part of the main run.</li>
          <li><strong>One game adapter.</strong>Market Brawl is the only game wired in. Another game needs its own adapter.</li>
        </ul>
      </section>
    </>
  );
}
