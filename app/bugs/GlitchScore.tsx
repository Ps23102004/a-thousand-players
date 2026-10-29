import { scoreGlitchBatch, type ScoredRound, type Rate } from "@/ai/glitch";

export default function GlitchScore({ data }: { data: { placeholder: boolean; source?: string; results: ScoredRound[] } }) {
  const score = scoreGlitchBatch(data.results);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const display = (r: Rate) => r.total ? `${r.yes}/${r.total} (${pct(r.rate)}; 95% Wilson ${pct(r.interval[0])}–${pct(r.interval[1])})` : "no observations";
  return <aside className="panel" data-testid="glitch-hunt-score" style={{ marginBottom: 20 }}>
    <h2>Glitch Hunter vision check</h2>
    {data.placeholder ? <p>Batch not run yet.</p> : <>
      {data.source === "fake" && <p>Fake answers; not a measured model result.</p>}
      <p>Hit rate: {display(score.overall.hit)}. False-alarm rate: {display(score.overall.falseAlarm)}.</p>
      <p>Unparseable answers: {score.overall.hit.unparseable + score.overall.falseAlarm.unparseable}.</p>
    </>}
    <p>Small sample; camera distance can hide glitches. The engine is the detector; vision is a second opinion.</p>
  </aside>;
}
