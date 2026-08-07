import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClubBadge, ClubBadgeLink, PlayerPortrait, PlayerPortraitLink } from "./VisualIdentity";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VisualIdentity", () => {
  it("uses downloaded local assets and keeps unresolved records blank", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clubs: [{ source_id: 7, status: "placeholder", local_path: null }], players: [{ source_id: 99, status: "downloaded", local_path: "/data/visual-assets/players/99.webp" }] }) }));
    render(<><PlayerPortrait playerId={99} playerName="Example Player" /><ClubBadge teamId={7} teamName="Example Club" /></>);
    const portrait = screen.getByTitle("Example Player portrait");
    await waitFor(() => expect(portrait).toHaveAttribute("src", "/data/visual-assets/players/99.webp"));
    expect(fetch).toHaveBeenCalledWith("/data/visual-assets/manifest.json", { cache: "no-store" });
    expect(portrait).toHaveAttribute("alt", "");
    expect(portrait).toHaveAttribute("loading", "lazy");
    expect(portrait).toHaveAttribute("decoding", "async");
    const badge = screen.getByTitle("Example Club");
    await waitFor(() => expect(badge).toHaveAttribute("src", "/data/visual-assets/placeholders/club.svg"));
    badge.dispatchEvent(new Event("error"));
    expect(badge).toHaveAttribute("src", "/data/visual-assets/placeholders/club.svg");
  });

  it("keeps the image decorative while exposing an accessible navigation link", () => {
    render(<><PlayerPortraitLink playerId={99} playerName="Example Player" href="?view=players&player_id=99" /><ClubBadgeLink teamId={7} teamName="Example Club" href="?view=explorer&team_id=7" /></>);
    expect(screen.getByRole("link", { name: "Open Example Player player profile" })).toHaveAttribute("href", "?view=players&player_id=99");
    expect(screen.getByRole("link", { name: "Open Example Club in Review Explorer" })).toHaveAttribute("href", "?view=explorer&team_id=7");
  });
});
