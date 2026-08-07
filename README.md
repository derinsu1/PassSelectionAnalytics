# Pass Selection Analytics

**Live demo:** https://passselectionanalytics-production.up.railway.app/

Pass Selection Analytics is a read-only football-analysis demo for exploring observed passes from ten 2024/25 Australian A-League matches. It combines actual-frame tracking playback with transparent local metrics so an analyst can compare the selected receiver with every tracked teammate at the moment of the pass. It is a case study and review tool, not a scouting product or a claim that one metric can determine the objectively correct pass.

## Run locally

Prerequisites: Git, Python 3.12 with [uv](https://docs.astral.sh/uv/), Node.js with Corepack enabled (or `pnpm` installed), and `make`.

```bash
git clone https://github.com/derinsu1/PassSelectionAnalytics.git
cd PassSelectionAnalytics
make app
```

Open http://127.0.0.1:5001. The repository already contains the runtime data. On later updates, run `git pull` followed by `make app`.

## What the app does

- **Review Explorer** filters all published observed passes, compares local actual-frame values with clearly separate provider peak-opportunity context, and exports the active population to Excel, JSON, or CSV.
- **Pass Inspector** plays the original 10 Hz tracking around an observed pass, shows the passer, selected receiver, every tracked teammate, and the same-frame comparison values. Browser-local annotations never alter the data.
- **Player Analysis** aggregates the fixed ten-match sample into player profiles, per-90 rates, receiving metrics, and stored positional percentiles.
- **Methodology** gives the in-app interpretation and limitation summary. Diagnostics are intentionally not part of this public release.

The app contains 7,029 analyst-visible pass decisions, 16,697 linked provider options, 70,290 tracked-teammate candidate rows, and 309 player-match rows. Player metrics and percentiles are fixed published values; filtering does not recompute them.

## Data and timing

The release includes only the data needed to run the app:

- final analytical tables used by the API and exports;
- match metadata and tracking frames required by the Pass Inspector; and
- local visual assets used by the interface.

It deliberately excludes raw Dynamic Events/phases data, correction ledgers, build scripts, fitted local-model files, research notes, and generated diagnostics. Every local comparison uses the authoritative actual pass frame. Provider option values remain available as optional context, but provider options are a sparse shortlist and their peak values can belong to an earlier frame; they are not the default all-teammate ranking universe.

## Local metrics

### Same-frame Local xT v1 and delta xT

Local xT v1 is a location-only expected-threat lookup on a versioned 12×8 pitch grid. For every tracked teammate at the actual pass frame, the app reads the receiver location from that grid and compares it with the passer-origin value:

`delta xT = receiver Local xT v1 − passer-origin Local xT v1`

It is useful for a simple location-value comparison, but it does not know pressure, passing lanes, reachability, body shape, kick type, or turnover risk. A higher Local xT v1 alternative is a review prompt, not proof that the observed choice was wrong.

### Local xPass v1

Local xPass estimates the probability of completion **conditional on deliberately attempting a direct pass to a named teammate at the actual pass frame**. It is project-owned and separate from Provider xPass.

The published estimator is a calibrated histogram-gradient-boosted tree model. It uses 21 actual-frame/pre-pass features: pass distance and direction, forward/lateral gain, nearest-defender pressure, lane clearance and interception margins, target-arrival margin, short-horizon player motion, and tracking-quality signals. Velocities use the five preceding 10 Hz frames (0.5 seconds); implausible jumps are excluded. Direct ground-pass features use an 18 m/s ball-speed convention.

Only observed receivers provide training labels: successful passes are 1, unsuccessful passes are 0, and offsides are excluded. Unchosen teammates are scored after fitting, never labelled as failed passes. The current model was evaluated leave-one-match-out over the ten matches, with imputation, fitting, and calibration contained in each training fold. Its reported held-out Brier score is 0.09444, log loss is 0.29654, and ROC-AUC is 0.87636. These results do not establish universal validity beyond this sample, league, or tracking system.

### Availability v1

Availability is an explainable lane/interception diagnostic, not a probability. For a direct ground-pass lane, the app compares the ball-arrival time against each defender’s conservative arrival time at sampled lane points. With the smallest defender-minus-ball arrival margin `m`, it stores:

`Availability = 1 / (1 + exp(-m / 0.35))`

Higher values indicate more time before the simplified defender model can reach the lane. The proxy has no information about footedness, body orientation, aerial passes, curve, or actual intended lead target.

### Pass Viability Index (PVI) v2

PVI is a deterministic 0–100 ranking score for eligible teammates at the actual pass frame. It is neither a probability, a player rating, nor an objective best-pass verdict. It combines Local xPass `p` with bounded delta-xT utility:

`U(d) = 0.5 + 0.5 × tanh(d / s)`

`PVI = 100 × (0.55 × p + 0.45 × U(d))`

Here, `d` is same-frame delta xT and `s` is the build-wide 75th percentile of `|d|`. The bounded transform prevents extreme grid differences from dominating. Availability is intentionally not an input because its lane evidence already contributes to Local xPass; adding it again would double-count related safety evidence.

### Player metrics and percentiles

Per-90 values use available regular-time minutes in the ten-match sample. Player positions use the primary position by regular-time minutes, and published percentiles compare players in the same primary position with at least 60 minutes. Low-minute profiles remain visible but are marked accordingly. These descriptive measures are sample-bound and should not be treated as broad player ratings.

## Limits

- Broadcast tracking can omit players or contain extrapolated points.
- Local xPass v1, Availability v1, Local xT v1, and PVI v2 are transparent analytical prompts, not ground truth or counterfactual outcomes.
- Provider peak-opportunity fields, Local xPass, and PVI have different timing and comparison universes and must not be interpreted as interchangeable.
- The ten-match open-data sample is too small for universal player or model claims.

## Data attribution and licences

Tracking data is from [SkillCorner Open Data](https://github.com/SkillCorner/opendata), a sample of ten 2024/25 A-League matches. Please credit SkillCorner when using this work. The source data is distributed under the MIT licence; its required notice follows.

> Copyright (c) 2020 SkillCorner. https://skillcorner.com
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The project code is MIT-licensed under [LICENSE](LICENSE). Player portraits and club badges are third-party assets retained for this demo; their rights remain with their respective owners. The source and attribution metadata for those assets is retained in `frontend/public/data/visual-assets/manifest.json`; this repository’s MIT licence does not apply to them. TheSportsDB assets are used subject to the [TheSportsDB terms of use](https://www.thesportsdb.com/docs_terms_of_use.php).
