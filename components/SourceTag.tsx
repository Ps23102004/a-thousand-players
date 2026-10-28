/** Tells a visitor where a page's content comes from: data recorded offline, or a model call made now. */
export default function SourceTag({ live, recorded }: { live?: string; recorded?: string }) {
  return (
    <div className="chips" style={{ margin: "8px 0 4px" }} aria-label="Where this page's content comes from">
      {recorded && <span className="chip" style={{ whiteSpace: "normal" }}>Recorded run · {recorded}</span>}
      {live && <span className="chip chip-ok" style={{ whiteSpace: "normal" }}>Live model call · {live}</span>}
    </div>
  );
}
