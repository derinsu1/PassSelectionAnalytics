import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AnnotationControls, type AnnotationStore } from "./AnnotationControls";
import { OptionTable } from "./OptionTable";
import { TimelineControls } from "./TimelineControls";
import { PassComparison } from "../pages/PassInspector";
import { metricHelp } from "../metricHelp";
import type { ReceiverOption, TimelineResponse } from "../types";

const option: ReceiverOption = {
  option_id: "decision:option",
  receiver_id: 2,
  receiver_name: "Example Receiver",
  is_selected: false,
  is_highest_pvi: false,
  is_provider_option: true,
  is_best_provider_alternative: false,
  tracking_quality: "detected",
  same_frame: { has_valid_location: false, invalid_reason: "missing_receiver_tracking", receiver_x: null, receiver_y: null, open_xt: null, delta_xt: null, rank: null, difference_from_selected: null },
  provider_peak: { available: true, peak_passing_option_frame: 102, peak_frame_offset: -2, peak_frame_offset_seconds: -0.2, xpass: 0.7, xthreat: 0.1, option_score: 0.8, expected_threat: 0.07, rank: 1, choice_objective: 0.056, composite_score: 38.26, choice_rank: 1, passing_option_at_pass_moment: true, metrics_are_same_frame: false },
  local_xpass: { eligible: false, invalid_reason: "missing_receiver_tracking", confidence: "unavailable", xpass: null, rank: null, availability_score: null },
  pass_viability: { eligible: false, invalid_reason: "same_frame_delta_xt_unavailable", score: null, rank: null, xt_utility: null, normalization_scale: null, version: null },
};

const timeline: TimelineResponse = {
  decision_id: "decision",
  provider_pass_frame: 100,
  window_start: 70,
  window_end: 130,
  available_frames: Array.from({ length: 61 }, (_, index) => index + 70),
  markers: [
    { label: "Actual pass frame", frame: 100, available: true },
  ],
};

describe("workbench components", () => {
  it("renders null values as an unavailable state and selects an option", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<OptionTable options={[option]} activeOptionId={null} onSelect={onSelect} />);
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Δ xT" })).toBeVisible();
    expect(screen.getByText(metricHelp.sameFrameDeltaXt, { selector: ".metric-tooltip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PVI" })).toBeVisible();
    expect(screen.getByRole("button", { name: "PVI" }).closest("th")).toHaveClass("is-pvi");
    expect(screen.getByText(metricHelp.passViability, { selector: ".metric-tooltip" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Example Receiver" }));
    expect(onSelect).toHaveBeenCalledWith(option);
  });

  it("sorts receiver options by pass viability", async () => {
    const user = userEvent.setup();
    const low = { ...option, option_id: "decision:low", receiver_name: "Low viability", pass_viability: { eligible: true, invalid_reason: null, score: 24, rank: 2, xt_utility: 0.4, normalization_scale: 0.006, version: "v2" } };
    const high = { ...option, option_id: "decision:high", receiver_name: "High viability", pass_viability: { eligible: true, invalid_reason: null, score: 88, rank: 1, xt_utility: 0.9, normalization_scale: 0.006, version: "v2" } };
    render(<OptionTable options={[low, high]} activeOptionId={null} onSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "PVI" }));
    expect(Array.from(document.querySelectorAll(".option-table tbody th[scope=\"row\"] .row-link")).map((item) => item.textContent)).toEqual(["High viability", "Low viability"]);
  });

  it("sorts PVI rank from frame-best to lowest rank on first click", async () => {
    const user = userEvent.setup();
    const rankTen = { ...option, option_id: "decision:rank-ten", receiver_name: "Rank ten", pass_viability: { eligible: true, invalid_reason: null, score: 14, rank: 10, xt_utility: 0.1, normalization_scale: 0.006, version: "v2" } };
    const rankOne = { ...option, option_id: "decision:rank-one", receiver_name: "Rank one", pass_viability: { eligible: true, invalid_reason: null, score: 88, rank: 1, xt_utility: 0.9, normalization_scale: 0.006, version: "v2" } };
    render(<OptionTable options={[rankTen, rankOne]} activeOptionId={null} onSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "PVI rank" }));
    expect(Array.from(document.querySelectorAll(".option-table tbody th[scope=\"row\"] .row-link")).map((item) => item.textContent)).toEqual(["Rank one", "Rank ten"]);
  });

  it("pins Highest PVI immediately after the selected option", () => {
    const selected = { ...option, option_id: "decision:selected", receiver_name: "Selected", is_selected: true, pass_viability: { ...option.pass_viability, eligible: true, score: 60, rank: 2 } };
    const highest = { ...option, option_id: "decision:highest", receiver_name: "Highest", is_highest_pvi: true, pass_viability: { ...option.pass_viability, eligible: true, score: 80, rank: 1 } };
    render(<OptionTable options={[highest, selected]} activeOptionId={null} onSelect={vi.fn()} />);
    expect(Array.from(document.querySelectorAll(".option-table tbody th[scope=\"row\"] .row-link")).map((item) => item.textContent)).toEqual(["Selected", "Highest"]);
  });

  it("compares the selected pass with the inspected pass without duplicating a selected inspection", () => {
    const selected: ReceiverOption = { ...option, option_id: "decision:selected", receiver_id: 4, receiver_name: "Selected", is_selected: true, same_frame: { ...option.same_frame, has_valid_location: true, open_xt: 0.01234, delta_xt: 0.00234, rank: 2, difference_from_selected: 0 }, local_xpass: { ...option.local_xpass, eligible: true, confidence: "high", xpass: 0.8123, rank: 2, availability_score: 0.734 }, pass_viability: { ...option.pass_viability, eligible: true, score: 72.4, rank: 2, xt_utility: 0.51 } };
    const highest: ReceiverOption = { ...selected, option_id: "decision:highest", receiver_id: 5, receiver_name: "Highest", is_selected: false, is_highest_pvi: true, same_frame: { ...selected.same_frame, open_xt: 0.02468, delta_xt: 0.01468, rank: 1, difference_from_selected: 0.01234 }, local_xpass: { ...selected.local_xpass, xpass: 0.9234, rank: 1, availability_score: 0.856 }, pass_viability: { ...selected.pass_viability, score: 86.2, rank: 1, xt_utility: 0.84 } };
    const { rerender } = render(<PassComparison selected={selected} inspected={highest} playerHref={(id) => `?player_id=${id}`} />);
    expect(screen.getByRole("heading", { name: "Selected pass vs inspected pass" })).toBeVisible();
    expect(screen.getAllByText("Highest PVI")).toHaveLength(2);
    expect(screen.getByText("Δ vs selected")).toBeVisible();
    expect(screen.queryByText("Local confidence")).not.toBeInTheDocument();
    expect(screen.getByText("PVI").closest("tr")).toHaveClass("is-pvi");
    expect(screen.getAllByText("0.01234")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Highest" })).toHaveAttribute("href", "?player_id=5");

    rerender(<PassComparison selected={selected} inspected={selected} playerHref={(id) => `?player_id=${id}`} />);
    expect(screen.getByRole("heading", { name: "Inspected pass is the selected pass" })).toBeVisible();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("exposes mouse-operable timeline controls", async () => {
    const user = userEvent.setup();
    const onFrame = vi.fn();
    render(<TimelineControls timeline={timeline} frame={100} playing={false} speed={1} onFrame={onFrame} onPlay={vi.fn()} onSpeed={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Next five frames" }));
    expect(onFrame).toHaveBeenNthCalledWith(1, 105);
  });

  it("steps through recorded frames instead of inventing a missing frame", async () => {
    const user = userEvent.setup();
    const onFrame = vi.fn();
    render(<TimelineControls timeline={{ ...timeline, available_frames: [98, 100, 103] }} frame={100} playing={false} speed={1} onFrame={onFrame} onPlay={vi.fn()} onSpeed={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Next frame" }));
    expect(onFrame).toHaveBeenCalledWith(103);
  });

  it("saves a browser-local annotation through the annotation store", async () => {
    const user = userEvent.setup();
    const store: AnnotationStore = { annotations: {}, values: [], update: vi.fn(), updatePlayer: vi.fn(), importAnnotations: vi.fn(), clear: vi.fn() };
    render(<AnnotationControls decisionId="decision" store={store} />);
    await user.selectOptions(screen.getByLabelText("Manual status"), "suspicious");
    await user.type(screen.getByLabelText("Finding or rationale"), "Receiver frame is suspicious.");
    await user.click(screen.getByRole("button", { name: "Save locally" }));
    expect(store.update).toHaveBeenCalledWith("decision", "suspicious", "Receiver frame is suspicious.");
    expect(screen.getByText("Annotation saved locally.")).toBeVisible();
  });

  it("saves a player annotation without reusing a decision identifier", async () => {
    const user = userEvent.setup();
    const store: AnnotationStore = { annotations: {}, values: [], update: vi.fn(), updatePlayer: vi.fn(), importAnnotations: vi.fn(), clear: vi.fn() };
    render(<AnnotationControls playerId={810406} store={store} />);
    await user.type(screen.getByLabelText("Finding or rationale"), "Low-minute profile context.");
    await user.click(screen.getByRole("button", { name: "Save locally" }));
    expect(store.updatePlayer).toHaveBeenCalledWith(810406, "unreviewed", "Low-minute profile context.");
  });
});
