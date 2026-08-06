import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const metadata = {
  application: "Analyst Validation Workbench",
  data_source: "test",
  analytical_artifact_revision: "test",
  counts: { decisions: 1, options: 2, review_candidates: 0 },
  filter_options: {
    matches: [
      { id: 1, label: "Home vs Away", home_team_id: 10, home_team_name: "Home", away_team_id: 20, away_team_name: "Away", score: "1–0", date_time: null },
      { id: 2, label: "Away vs Third", home_team_id: 20, home_team_name: "Away", away_team_id: 30, away_team_name: "Third", score: "0–0", date_time: null },
    ],
    teams: [{ id: 10, label: "Home" }, { id: 20, label: "Away" }, { id: 30, label: "Third" }],
    players: [
      { id: 100, label: "Home Passer", scopes: [{ match_id: 1, team_id: 10 }] },
      { id: 200, label: "Away Passer", scopes: [{ match_id: 1, team_id: 20 }, { match_id: 2, team_id: 20 }] },
      { id: 300, label: "Third Passer", scopes: [{ match_id: 2, team_id: 30 }] },
    ],
    review_classifications: [], pass_outcomes: [], review_metric_bounds: {
      selected_rank: { minimum: 1, maximum: 10, step: 1 },
      same_frame_margin: { minimum: 0, maximum: 0.25, step: 0.001 },
      selected_pass_viability_score: { minimum: 25, maximum: 100, step: 0.1 },
      pass_viability_gap: { minimum: 0, maximum: 50, step: 0.1 },
    },
  },
};

const reviews = {
  items: [{
    decision_id: "test:1", match_id: 1, match_name: "Home vs Away", period: 1, frame: 100, match_clock: "01:00", team_id: 10, team_name: "Home", passer_id: 100, passer_name: "Home Passer", passer_origin_third: "attacking", passer_origin_side: "left", selected_receiver_id: 101, selected_receiver_name: "Selected", selected_open_xt_rank: 2, selected_open_xt: 0.01, selected_open_xt_delta: 0.002, highest_open_xt_receiver_id: 102, highest_open_xt_receiver_name: "Open option", highest_open_xt: 0.02, highest_open_xt_delta: 0.012, local_open_xt_margin: 0.01, selected_local_xpass: 0.82, selected_availability_score: 0.75, selected_pass_viability_score: 70.2, selected_pass_viability_rank: 2, best_pass_viability_receiver_id: 103, best_pass_viability_receiver_name: "Viable option", best_pass_viability_score: 82.4, pass_viability_gap: 12.2, selected_provider_choice_objective: null, selected_provider_composite_score: null, selected_provider_choice_rank: null, provider_choice_margin: null, provider_composite_score_margin: null, review_classification: "selected_best", is_review_candidate: false, provider_agreement: null, pass_outcome: "successful",
  }], total: 1, page: 1, page_size: 50, sort_by: "minute", sort_direction: "asc",
  metrics: { decision_count: 1, review_candidate_count: 0, classification_distribution: {}, median_same_frame_margin: 0.01, p95_same_frame_margin: 0.01, selected_pvi_eligible_count: 1, median_selected_pass_viability_score: 70.2, median_pass_viability_gap: 12.2, selected_not_frame_best_pvi_count: 1, median_selected_local_xpass: 0.82, median_selected_availability_score: 0.75, selected_provider_choice_coverage: 1, median_selected_provider_choice_objective: 0.068, median_selected_provider_composite_score: 40.82, selected_not_provider_best_count: 1, unique_matches: 1, unique_passers: 1, passer_origin_coverage: 1, passer_origin_third_distribution: { defensive: 0, middle: 0, attacking: 1 }, passer_origin_side_distribution: { left: 1, center: 0, right: 0 } },
  applied_filters: { match_id: null, team_id: null, passer_id: null, passer_origin_third: null, passer_origin_side: null, review_classification: null, review_candidate: null, pass_outcome: null, selected_rank: null, min_selected_rank: null, max_selected_rank: null, min_same_frame_margin: null, max_same_frame_margin: null, min_selected_pass_viability_score: null, max_selected_pass_viability_score: null, min_pass_viability_gap: null, max_pass_viability_gap: null, selected_pvi_not_best: null, provider_agreement: null, search: null },
};

const playerPassing = {
  attempts: 10, successful: 8, unsuccessful: 2, offside: 0, resolved_attempts: 10,
  attempts_per90: 45, completions_per90: 36, completion_rate: 0.8,
  local_xpass: 0.78, local_xpass_coverage: 10, availability: 0.72, availability_coverage: 10,
  mean_local_xpass_rank: 3.2, pvi: 68.4, pvi_coverage: 10, frame_best_pvi_selection_rate: 0.4,
  mean_pvi_gap: 8.3, execution_eligible_count: 10, expected_completions: 7.8,
  expected_completions_per90: 35.1, completion_above_expected: 0.2, completion_above_expected_per90: 0.9,
  attacking_eligible_count: 8, higher_open_xt_alternative_count: 1, higher_open_xt_alternative_rate: 0.125,
  higher_open_xt_alternatives_per90: 4.5, mean_higher_open_xt_margin: 0.02,
};

const playerReceiving = {
  targets: 12, successful: 10, unsuccessful: 2, offside: 0, resolved_targets: 12,
  targets_per90: 54, successful_receptions_per90: 45, target_completion_rate: 0.833,
  local_xpass: 0.81, local_xpass_coverage: 12, availability: 0.75, availability_coverage: 12,
  pvi: 70.1, pvi_coverage: 12,
};

const playerPercentileMetrics = [
  ["passes_per90", "Passes /90", "number", "higher_is_better", true],
  ["completion_rate", "Pass completion", "percent", "higher_is_better", true],
  ["local_xpass", "Selected Local xPass", "number", "higher_is_better", true],
  ["availability", "Selected Availability", "number", "higher_is_better", true],
  ["pvi", "Selected PVI", "number", "higher_is_better", true],
  ["pvi_best_rate", "Frame-best PVI selection", "percent", "higher_is_better", true],
  ["completion_above_expected_per90", "Completion above Local xPass /90", "number", "higher_is_better", true],
  ["higher_open_xt_per90", "Higher open-xT alternatives /90", "number", "lower_is_better", true],
  ["targets_per90", "Targets /90", "number", "higher_is_better", true],
  ["successful_receptions_per90", "Successful receptions /90", "number", "higher_is_better", true],
  ["target_completion_rate", "Target completion", "percent", "higher_is_better", true],
  ["target_pvi", "Target PVI", "number", "higher_is_better", true],
] as const;

const playerPercentiles = playerPercentileMetrics.map(([metric, label, valueFormat, direction, headline], index) => ({
  metric, label, value: valueFormat === "percent" ? 0.8 : 45 + index, percentile: 76 - index,
  peer_count: 12, direction, value_format: valueFormat, headline,
}));

const playerSummary = {
  player_id: 100, player_name: "Home Passer", team_id: 10, team_name: "Home", player_role: "Midfield",
  percentile_position: "Midfield", appearances: 1, regular_minutes: 20, low_minutes_sample: true, passing: playerPassing, receiving: playerReceiving,
  selected_percentile: playerPercentiles.find((metric) => metric.metric === "pvi"),
};

const playerDirectory = {
  items: [playerSummary], total: 1, sort_by: "minutes", sort_direction: "desc",
  applied_filters: { match_id: null, team_id: null, search: null, hide_under_60: true, position: null, percentile_metric: "pvi", min_percentile: null, max_percentile: null },
  positions: ["Full Back", "Midfield"],
  percentile_metrics: playerPercentileMetrics.map(([metric, label, value_format, direction, headline]) => ({ metric, label, value_format, direction, headline })),
};

const playerDetail = { ...playerSummary, match_breakdown: [{ ...playerSummary, selected_percentile: null, match_id: 1, match_name: "Home vs Away" }], percentiles: playerPercentiles };
const comparisonSummary = { ...playerSummary, player_id: 101, player_name: "Away Creator", team_id: 20, team_name: "Away", player_role: "Attacking Midfield", percentile_position: "Attacking Midfield", regular_minutes: 180, low_minutes_sample: false, passing: { ...playerPassing, pvi: 72.4 }, selected_percentile: playerPercentiles.find((metric) => metric.metric === "pvi") };
const comparisonDetail = { ...comparisonSummary, match_breakdown: [{ ...comparisonSummary, selected_percentile: null, match_id: 1, match_name: "Home vs Away" }], percentiles: playerPercentiles.map((metric, index) => ({ ...metric, value: typeof metric.value === "number" ? metric.value + index + 2 : metric.value, percentile: 62 - index })) };
const comparisonDirectory = { ...playerDirectory, items: [playerSummary, comparisonSummary], total: 2, applied_filters: { ...playerDirectory.applied_filters, hide_under_60: false } };

describe("App URL-backed review filters", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?view=explorer");
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const payload = url.includes("/api/metadata") ? metadata
        : url.includes("/api/player-stats/101") ? comparisonDetail
        : url.includes("/api/player-stats/100") ? playerDetail
        : url.includes("hide_under_60=false") ? comparisonDirectory
        : url.includes("/api/player-stats") ? playerDirectory
        : reviews;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    }));
  });

  it("writes a filter selection into the browser URL", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await user.selectOptions(screen.getByLabelText("Match"), "1");
    await waitFor(() => expect(window.location.search).toContain("match_id=1"));
  });

  it("shows a task-specific footer for the active workspace tab", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    expect(screen.getByText("Filter the queue, then open a decision to compare the actual pass frame.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Player Analysis" }));
    await screen.findByRole("heading", { name: "Player Analysis" });
    expect(screen.getByText("Use the directory to find a profile, then read its available-match context before comparing players.")).toBeVisible();
  });

  it("exposes each decision as a real inspector link for opening in a new tab", async () => {
    render(<App />);
    const decision = await screen.findByRole("link", { name: "01:00 · test:1" });
    expect(decision).toHaveAttribute("href", "?view=inspector&decision=test%3A1");
  });

  it("writes combined passer-origin filters into the browser URL", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await user.click(screen.getByText("Review context", { exact: true }));
    await user.selectOptions(screen.getByLabelText("Passer third"), "attacking");
    await user.selectOptions(screen.getByLabelText("Passer side"), "left");
    await waitFor(() => expect(window.location.search).toContain("passer_origin_third=attacking"));
    expect(window.location.search).toContain("passer_origin_side=left");
    expect(screen.getByLabelText("Passer third")).toBeVisible();
    expect(screen.getByLabelText("Passer side")).toBeVisible();
  });

  it("shows persisted PVI comparison fields and requests PVI ordering", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    expect(screen.getAllByText("70.20")[0]).toBeVisible();
    expect(screen.getByText("Viable option")).toBeVisible();
    expect(screen.getByText(/deterministic 0–100 blend/, { selector: ".metric-tooltip" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Selected PVI" }));
    await waitFor(() => expect(window.location.search).toContain("sort_by=pass_viability"));
  });

  it("offers sorting for every sortable Review Explorer filter field", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await user.click(screen.getByRole("button", { name: "Team" }));
    await waitFor(() => expect(window.location.search).toContain("sort_by=team"));
    await user.click(screen.getByRole("button", { name: "Selected Local xT v1 rank" }));
    await waitFor(() => expect(window.location.search).toContain("sort_by=selected_rank"));
    await user.click(screen.getByRole("button", { name: "PVI rank" }));
    await waitFor(() => expect(window.location.search).toContain("sort_by=pass_viability_rank"));
  });

  it("writes local PVI selection and gap filters into the browser URL", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await user.click(screen.getByText("Review context", { exact: true }));
    await user.click(screen.getByText("Precision ranges", { exact: true }));
    await user.selectOptions(screen.getByLabelText("PVI selection"), "true");
    const gap = within(screen.getByRole("group", { name: "PVI gap" }));
    await user.click(gap.getByRole("button", { name: "Edit Minimum for PVI gap" }));
    const gapMinimum = gap.getByRole("spinbutton");
    await user.clear(gapMinimum);
    await user.type(gapMinimum, "10");
    await waitFor(() => expect(window.location.search).toContain("selected_pvi_not_best=true"));
    expect(window.location.search).toContain("min_pass_viability_gap=10");
    expect(screen.getByText("Filtered decisions")).toBeVisible();
  });

  it("keeps an out-of-range PVI gap in the filter controls instead of failing the view", async () => {
    window.history.replaceState({}, "", "/?view=explorer&min_pass_viability_gap=102");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    const gap = within(screen.getByRole("group", { name: "PVI gap" }));
    await user.click(gap.getByRole("button", { name: "Edit Minimum for PVI gap" }));
    expect(gap.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be between 0 and 50.")).toBeVisible();
    expect(screen.getByText("Candidate table")).toBeVisible();
  });

  it("keeps the default PVI gap until it is cleared, then leaves it blank", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await user.click(screen.getByText("Precision ranges", { exact: true }));
    const gap = within(screen.getByRole("group", { name: "PVI gap" }));
    await user.click(gap.getByRole("button", { name: "Edit Minimum for PVI gap" }));
    const minimum = gap.getByRole("spinbutton");
    expect(minimum).toHaveValue(10);
    await user.clear(minimum);
    await waitFor(() => expect(window.location.search).toContain("queue=all"));
    expect(window.location.search).not.toContain("min_pass_viability_gap");
    expect(minimum).toHaveValue(null);
  });

  it("uses metadata bounds for the rank slider and keeps annotation in Review context", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await user.click(screen.getByText("Precision ranges", { exact: true }));
    await user.click(screen.getByText("Review context", { exact: true }));
    expect(screen.getByLabelText("Selected Local xT v1 rank minimum slider")).toHaveAttribute("max", "10");
    expect(screen.getByLabelText("Selected Local xT v1 rank maximum slider")).toHaveAttribute("max", "10");
    expect(screen.getByLabelText("Manual annotation")).toBeVisible();
    expect(screen.queryByText("Data quality and annotation")).not.toBeInTheDocument();
    expect(screen.queryByText("Integrity")).not.toBeInTheDocument();
    expect(screen.queryByText("Arrow")).not.toBeInTheDocument();
  });

  it("sanitizes retired quality filters and integrity sorting from an Explorer URL", async () => {
    window.history.replaceState({}, "", "/?view=explorer&integrity_status=valid&arrow_verified=true&sort_by=integrity");
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await waitFor(() => expect(window.location.search).not.toContain("integrity_status"));
    expect(window.location.search).not.toContain("arrow_verified");
    expect(window.location.search).toContain("sort_by=minute");
  });

  it("migrates the former exact open-xT-rank URL to a min/max range", async () => {
    window.history.replaceState({}, "", "/?view=explorer&selected_rank=3");
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("selected_rank")).toBe(false));
    expect(window.location.search).toContain("min_selected_rank=3");
    expect(window.location.search).toContain("max_selected_rank=3");
  });

  it("scopes match and passer options to the selected team, then scopes team and passers to the selected match", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });

    const filterLabels = Array.from(document.querySelectorAll(".filter-quick-grid > label"))
      .slice(0, 3)
      .map((label) => label.childNodes[0]?.textContent);
    expect(filterLabels).toEqual(["Team", "Match", "Passer"]);

    const team = screen.getByLabelText("Team");
    const match = screen.getByLabelText("Match");
    const passer = screen.getByLabelText("Passer");
    await user.selectOptions(team, "20");
    await waitFor(() => expect(window.location.search).toContain("team_id=20"));
    expect(within(match).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All matches", "Home vs Away", "Away vs Third",
    ]);
    expect(within(passer).queryByRole("option", { name: "Home Passer" })).not.toBeInTheDocument();
    expect(within(passer).getByRole("option", { name: "Away Passer" })).toBeInTheDocument();
    expect(within(passer).queryByRole("option", { name: "Third Passer" })).not.toBeInTheDocument();

    await user.selectOptions(team, "");
    await waitFor(() => expect(window.location.search).not.toContain("team_id="));
    await user.selectOptions(match, "1");
    await waitFor(() => expect(window.location.search).toContain("match_id=1"));
    expect(within(team).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All teams", "Home", "Away",
    ]);
    expect(within(passer).getByRole("option", { name: "Home Passer" })).toBeInTheDocument();
    expect(within(passer).getByRole("option", { name: "Away Passer" })).toBeInTheDocument();
    expect(within(passer).queryByRole("option", { name: "Third Passer" })).not.toBeInTheDocument();
  });

  it("clears an incompatible legacy team selection while retaining its valid match", async () => {
    window.history.replaceState({}, "", "/?view=explorer&match_id=1&team_id=30");
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    await waitFor(() => expect(window.location.search).not.toContain("team_id=30"));
    expect(screen.getByLabelText("Match")).toHaveValue("1");
    expect(screen.getByLabelText("Team")).toHaveValue("");
  });

  it("opens the Player Analysis directory with the default low-minute guard and URL-backed toggle", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?view=players");
    render(<App />);
    await screen.findByRole("heading", { name: "Player Analysis" });
    expect(screen.getByText("Home Passer")).toBeVisible();
    expect(screen.getByLabelText("Hide players under 60 minutes")).toBeChecked();
    expect(screen.getByRole("link", { name: "Home Passer" })).toHaveAttribute("href", "?view=players&player_id=100");
    await user.click(screen.getByText("Directory refinement", { exact: true }));
    await user.selectOptions(screen.getByLabelText("Primary position"), "Full Back");
    await waitFor(() => expect(window.location.search).toContain("player_position=Full+Back"));
    await user.selectOptions(screen.getByLabelText("Percentile metric"), "higher_open_xt_per90");
    await waitFor(() => expect(window.location.search).toContain("player_percentile_metric=higher_open_xt_per90"));
    await user.click(screen.getByRole("button", { name: "Edit Minimum percentile for Positional percentile" }));
    await user.type(screen.getByRole("spinbutton"), "60");
    await waitFor(() => expect(window.location.search).toContain("player_min_percentile=60"));
    await user.click(screen.getByLabelText("Hide players under 60 minutes"));
    await waitFor(() => expect(window.location.search).toContain("player_hide_under_60=false"));
  });

  it("renders a selected player's available-match profile and match breakdown", async () => {
    window.history.replaceState({}, "", "/?view=players&player_id=100");
    render(<App />);
    await screen.findByRole("heading", { name: "Home Passer" });
    expect(screen.getByRole("heading", { name: "Available-match breakdown" })).toBeVisible();
    expect(screen.getByText(/This profile is below 60 available-match minutes/)).toBeVisible();
    expect(screen.getByText("Expected completions /90")).toBeVisible();
    expect(screen.queryByText("Observed completion")).not.toBeInTheDocument();
    expect(screen.getAllByText("Targets /90").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "All positional percentiles" })).toBeVisible();
    expect(screen.getByLabelText(/Selected PVI: 72nd percentile/)).toBeVisible();
  });

  it("compares a viewed player with a searched profile and keeps the choice in the URL", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?view=players&player_id=100");
    render(<App />);
    await screen.findByRole("heading", { name: "Home Passer" });
    await user.click(screen.getByRole("button", { name: "Compare with…" }));
    await user.type(screen.getByRole("combobox", { name: "Find a player" }), "creator");
    await user.click(screen.getByRole("button", { name: /Away Creator/ }));
    await screen.findByRole("heading", { name: /Home Passer.*vs.*Away Creator/ });
    expect(window.location.search).toContain("compare_player_id=101");
    expect(screen.getByText("All 20 metrics")).toBeVisible();
    expect(screen.getByText(/separate primary-position cohorts/)).toBeVisible();
    expect(screen.getAllByTitle("Home Passer portrait").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Away Creator portrait").length).toBeGreaterThan(0);
  });

  it("renders navigable local identity in the analyst tabs without adding it to Methodology", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Review Explorer" });
    expect(screen.getAllByRole("link", { name: "Open Home in Review Explorer" })[0]).toHaveAttribute("href", expect.stringContaining("team_id=10"));
    expect(screen.getByRole("link", { name: "Open Home Passer player profile" })).toHaveAttribute("href", "?view=players&player_id=100");
    await user.click(screen.getByRole("button", { name: "Player Analysis" }));
    await screen.findByRole("heading", { name: "Player Analysis" });
    expect(screen.getByRole("link", { name: "Open Home Passer player profile" })).toHaveAttribute("href", expect.stringContaining("player_id=100"));
    await user.click(screen.getByRole("button", { name: "Methodology" }));
    await screen.findByRole("heading", { name: "What this app can and cannot say" });
    expect(screen.queryByRole("region", { name: "Available fixture sample" })).not.toBeInTheDocument();
  });
});
