import { Definition } from "../components/Common";
import { ExportMenu } from "../components/ExportMenu";

export function Methodology() {
  return (
    <div className="page-stack methodology-page">
      <section className="page-intro"><div><p className="eyebrow">Methodology and limits</p><h1>What this app can—and cannot—say</h1><p>An actual-frame analyst tool for reviewing observed pass decisions across every tracked teammate.</p></div><ExportMenu title="Methodology" methodology /></section>
      <section className="method-grid">
        <article className="panel"><p className="eyebrow">Question</p><h2>Pass selection, not a verdict</h2><p>For each observed pass, the app exposes every tracked teammate at the actual pass frame. It produces review prompts under explicit proxies; it does not establish the objectively correct pass.</p></article>
        <article className="panel"><p className="eyebrow">Source</p><h2>SkillCorner A-League Open Data</h2><p>The validated dataset covers ten 2024/25 A-League matches. Broadcast tracking can omit players, contain extrapolations, and is not sufficient for broad player ratings.</p></article>
        <article className="panel"><p className="eyebrow">Same-frame comparison</p><h2>Open xT at actual pass time</h2><p>Same-frame rankings use receiver tracking locations at the authoritative player-possession pass frame and a versioned 12×8 open xT grid. It is deliberately a location-only proxy.</p></article>
        <article className="panel"><p className="eyebrow">Why local first</p><h2>One actual-frame comparison universe</h2><p>Provider options are a sparse shortlist while local candidates cover nearly every tracked teammate. Untargeted provider values can come from earlier peak frames. Provider xPass can still aid observed-pass calibration, but it is not the default all-teammate actual-frame ranking.</p></article>
        <article className="panel"><p className="eyebrow">Local xPass v0</p><h2>A transparent actual-frame estimate</h2><p>The project-owned model estimates completion conditional on deliberately attempting a direct pass to the named teammate. It uses geometry, defender pressure, lane/interception proxies, and short tracking-derived momentum. It is never presented as Provider xPass.</p></article>
      </section>
      <section className="panel methodology-section"><p className="eyebrow">Coordinate provenance</p><h2>Tracking uses a physical pitch frame</h2><p>Tracking coordinates are physical, centred-pitch metres. The API supplies them directly to the renderer; the browser does not transform coordinates or recalculate metrics.</p></section>
      <section className="panel methodology-section"><p className="eyebrow">Local review prompts</p><h2>Conservative, outcome-independent evidence</h2><dl className="definition-grid"><Definition term="Highest PVI">The eligible tracked teammate with the highest PVI v1 at the actual pass frame. It is an analytical comparison state, not a recommended pass.</Definition><Definition term="Open xT margin">The highest valid tracked-teammate open-xT value minus the selected receiver value. It is a location-only proxy.</Definition><Definition term="Insufficient quality">A necessary location, tracking, or coordinate input is unavailable.</Definition></dl></section>
        <section className="methodology-callout"><p className="eyebrow">Important limits</p><ul><li>The 12×8 open xT grid cannot represent pressure, lane obstruction, reachability, or turnover value.</li><li>Local xPass v0 conditions on an attempted pass. It does not label unselected teammates as failed passes or prove a hypothetical choice would succeed.</li><li>Availability v0 uses a direct ground-pass and simplified player-arrival convention; body orientation, footedness, and kick height are not available.</li><li>Local xPass and PVI are not ground truth; they are transparent prompts for analyst review.</li></ul></section>
    </div>
  );
}
