import { Definition } from "../components/Common";
import { ExportMenu } from "../components/ExportMenu";

export function Methodology() {
  return (
    <div className="page-stack methodology-page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Methodology and limits</p>
          <h1>What this app can and cannot say</h1>
          <p>A local, actual-frame tool for comparing an observed pass with every tracked teammate. It produces evidence for analyst review, not a verdict on whether a player chose the correct pass.</p>
        </div>
        <ExportMenu title="Methodology" methodology />
      </section>

      <section className="panel methodology-overview" aria-labelledby="methodology-start">
        <div>
          <p className="eyebrow">Start here</p>
          <h2 id="methodology-start">A snapshot of the decision moment</h2>
          <p>For every observed pass, the workbench compares the selected receiver with the teammates tracked at the actual pass frame. Each custom metric answers one narrow question. Reading them together is more useful than treating any one score as the answer.</p>
        </div>
        <ul className="methodology-overview__rules">
          <li><strong>Actual frame:</strong> all local comparisons use the same observed decision moment.</li>
          <li><strong>Transparent proxies:</strong> the metrics simplify football reality and state their assumptions.</li>
          <li><strong>Analyst evidence:</strong> a high score can prompt review, not prove a better pass existed.</li>
        </ul>
      </section>

      <section className="methodology-section" aria-labelledby="custom-metrics">
        <p className="eyebrow">The custom metrics</p>
        <h2 id="custom-metrics">Four questions about each possible pass</h2>
        <p>These are project-owned metrics. They are separate from provider fields and are calculated for the tracked teammates available in the same frame.</p>
        <div className="methodology-metric-grid">
          <article className="panel methodology-metric-card">
            <p className="eyebrow">Local xPass v1</p>
            <h3>How likely is this attempted pass to arrive?</h3>
            <p>Local xPass estimates the chance that a direct pass to a named teammate would be completed. Higher is safer under the model.</p>
            <p className="panel-note">It is conditional on attempting that pass. It does not say the passer would choose it, or guarantee that an unattempted pass would succeed.</p>
          </article>
          <article className="panel methodology-metric-card">
            <p className="eyebrow">Availability v1</p>
            <h3>Can the ball travel through the lane?</h3>
            <p>Availability is a simple defender-versus-ball arrival check for the direct passing lane. Higher means the assumed ball reaches the lane before the most dangerous defender.</p>
            <p className="panel-note">It is an explanatory interception-risk proxy, not a calibrated probability and not a full pitch-control model.</p>
          </article>
          <article className="panel methodology-metric-card">
            <p className="eyebrow">Local xT v1</p>
            <h3>How valuable is the receiver's location?</h3>
            <p>Local xT gives a location-based estimate of future attacking value. The displayed delta xT compares the receiver's same-frame location with the ball origin.</p>
            <p className="panel-note">It values where the player is, not whether a pass can reach them, what happens after it arrives, or the risk of losing the ball.</p>
          </article>
          <article className="panel methodology-metric-card">
            <p className="eyebrow">PVI v2</p>
            <h3>How does safety compare with potential progress?</h3>
            <p>Pass Viability Index combines Local xPass with bounded same-frame delta xT to rank risk and reward together. Higher means a stronger balance under this project's assumptions.</p>
            <p className="panel-note">PVI is a deterministic preference score from 0 to 100. It is not a probability, a player rating, or a correct-pass label.</p>
          </article>
        </div>
      </section>

      <section className="panel methodology-provider" aria-labelledby="provider-context">
        <div>
          <p className="eyebrow">Why local metrics lead the comparison</p>
          <h2 id="provider-context">Provider metrics are useful, but answer a different question</h2>
        </div>
        <div className="methodology-provider__copy">
          <p>Provider xPass, xThreat, and Option score are retained as valuable external evidence. They should not be treated as wrong or discarded.</p>
          <p>They are not the default comparison because they exist only for a provider-defined shortlist, while local metrics cover nearly every tracked teammate. For unselected options, provider values can also be recorded at an earlier peak-opportunity frame instead of the frame when the observed pass was played.</p>
          <p>Use provider evidence to add context or compare methods. Use local metrics when the question is: how did every tracked teammate compare at the actual pass moment?</p>
        </div>
      </section>

      <section className="methodology-section methodology-technical" aria-labelledby="technical-method">
        <p className="eyebrow">For technical readers</p>
        <h2 id="technical-method">How the current metrics are calculated</h2>
        <div className="methodology-technical-grid">
          <article className="panel">
            <h3>Local xPass v1</h3>
            <p>A calibrated histogram gradient-boosted classifier uses 21 features from the actual pass frame and the preceding 0.5 seconds of tracking. Features cover geometry, pressure, lane and interception margins, short-horizon movement, and input quality. It is trained only on observed selected-pass outcomes and evaluated with leave-one-match-out validation across the ten available matches.</p>
          </article>
          <article className="panel">
            <h3>Availability v1</h3>
            <p>The model assumes a direct ground pass travelling at 18 m/s, samples ten points along the lane, and compares ball arrival with a simplified defender-arrival model. The minimum defender-versus-ball time margin is passed through a sigmoid for readable 0 to 1 scoring.</p>
          </article>
          <article className="panel">
            <h3>Local xT v1</h3>
            <p>The project uses <a href="https://karun.in/blog/data/open_xt_12x8_v1.json" target="_blank" rel="noreferrer">Karun Singh's open-source, versioned 12 by 8 xT grid</a>. It looks up the ball-origin and receiver locations in the attacking direction, then calculates delta xT as receiver xT minus origin xT. This is deliberately a static location-value baseline.</p>
          </article>
          <article className="panel">
            <h3>PVI v2</h3>
            <p>PVI uses 55 percent Local xPass and 45 percent bounded delta xT utility. The delta xT term is centred at neutral value and transformed with a tanh function scaled by the build-wide 75th percentile of absolute delta xT, so extreme grid differences cannot dominate the ranking.</p>
            <code>PVI = 100 x (0.55 x Local xPass + 0.45 x bounded delta xT utility)</code>
          </article>
        </div>
      </section>

      <section className="panel methodology-section" aria-labelledby="review-prompts">
        <p className="eyebrow">Local review prompts</p>
        <h2 id="review-prompts">Risk-reward, outcome-independent evidence</h2>
        <dl className="definition-grid">
          <Definition term="Highest PVI">The eligible tracked teammate with the highest PVI v2 at the actual pass frame. It is an analytical comparison state, not a recommended pass.</Definition>
          <Definition term="Local xT v1 margin">The highest valid tracked-teammate Local xT v1 value minus the selected receiver value. It is a location-only proxy.</Definition>
        </dl>
      </section>

      <section className="methodology-callout" aria-labelledby="current-limits">
        <p className="eyebrow">Important current limits</p>
        <h2 id="current-limits">Use the evidence in its proper scope</h2>
        <ul>
          <li>The dataset contains ten 2024/25 A-League matches. It is not enough for broad player ratings or universal model claims.</li>
          <li>Broadcast tracking can omit players or contain extrapolated positions. Body orientation, preferred foot, kick height, curve, and intended lead target are not available.</li>
          <li>Local xPass and PVI are transparent prompts for analyst review. They are not ground truth, hindsight verdicts, or complete counterfactual simulations.</li>
        </ul>
      </section>

      <section className="panel methodology-roadmap" aria-labelledby="improvement-roadmap">
        <p className="eyebrow">How this analysis can improve</p>
        <h2 id="improvement-roadmap">From a useful prototype to a stronger decision model</h2>
        <ol>
          <li><strong>Collect more representative data.</strong> More matches, seasons, teams, and game states would improve model training, enable credible independent validation, and make calibration checks more reliable.</li>
          <li><strong>Build contextual xT.</strong> A stronger value model should use player locations, pressure, spacing, passing lanes, reachability, and match context rather than only a receiver coordinate on a static grid.</li>
          <li><strong>Add action value and turnover cost.</strong> VAEP or a VAEP-style model can estimate how an action changes short-term scoring and conceding probability. It needs a larger, consistently labelled sequence of on-ball actions before it can be trained and validated credibly here.</li>
          <li><strong>Test a future PVI as a combined model.</strong> A stronger index could combine xPass for pass feasibility, contextual xT for opportunity, and action value for upside and turnover downside. Its inputs must be tested for overlap, calibration, and double-counting before they are combined.</li>
          <li><strong>Improve the physical pass model.</strong> Ball-flight, pass type, body orientation, preferred foot, and richer tracking would make completion and interception estimates more realistic.</li>
          <li><strong>Keep analysts in the loop.</strong> Better models still need blinded case review, error analysis, and feedback from performance staff before they inform football decisions.</li>
        </ol>
      </section>
    </div>
  );
}
