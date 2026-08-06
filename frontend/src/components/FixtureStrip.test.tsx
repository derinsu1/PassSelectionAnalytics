import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FixtureStrip } from "./FixtureStrip";

describe("FixtureStrip", () => {
  it("renders a selected fixture with linked club crests and score", () => {
    render(<FixtureStrip match={{ id: 1, label: "Home vs Away", home_team_id: 10, home_team_name: "Home", away_team_id: 20, away_team_name: "Away", score: "1–0", date_time: null }} teamHref={(teamId) => `?view=explorer&team_id=${teamId}`} variant="hero" />);
    expect(screen.getByRole("region", { name: "Home versus Away" })).toHaveTextContent("1–0");
    expect(screen.getByRole("link", { name: "Open Home in Review Explorer" })).toHaveAttribute("href", "?view=explorer&team_id=10");
    expect(screen.getByRole("link", { name: "Open Away in Review Explorer" })).toHaveAttribute("href", "?view=explorer&team_id=20");
  });

  it("renders a local club rail for the all-matches state and handles an unavailable score", () => {
    const matches = [
      { id: 1, label: "Home vs Away", home_team_id: 10, home_team_name: "Home", away_team_id: 20, away_team_name: "Away", score: null, date_time: null },
      { id: 2, label: "Away vs Third", home_team_id: 20, home_team_name: "Away", away_team_id: 30, away_team_name: "Third", score: "0–0", date_time: null },
    ];
    const { rerender } = render(<FixtureStrip matches={matches} teamHref={(teamId) => `?view=explorer&team_id=${teamId}`} />);
    expect(screen.getByRole("region", { name: "Available fixture sample" })).toHaveTextContent("2 matches · 3 clubs");
    expect(screen.getByRole("link", { name: "Open Third in Review Explorer" })).toHaveAttribute("href", "?view=explorer&team_id=30");
    rerender(<FixtureStrip match={matches[0]} teamHref={(teamId) => `?view=explorer&team_id=${teamId}`} />);
    expect(screen.getByText("Score unavailable")).toBeVisible();
  });
});
