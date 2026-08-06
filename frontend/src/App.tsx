import { useCallback, useEffect, useMemo, useState } from "react";

import { useAnnotations } from "./hooks";
import { Methodology } from "./pages/Methodology";
import { PassInspector } from "./pages/PassInspector";
import { PlayerAnalysis } from "./pages/PlayerAnalysis";
import { ReviewExplorer } from "./pages/ReviewExplorer";

type View = "explorer" | "inspector" | "players" | "methodology";

const footerByView: Record<View, string> = {
  explorer: "Filter the queue, then open a decision to compare the actual pass frame.",
  inspector: "Use playback and the teammate table to compare the selected pass with its actual-frame alternatives.",
  players: "Use the directory to find a profile, then read its available-match context before comparing players.",
  methodology: "Use these definitions to interpret local metrics, timing, and comparison limits consistently.",
};

function readLocation() {
  return window.location.search;
}

export function App() {
  const [searchText, setSearchText] = useState(readLocation);
  const annotations = useAnnotations();
  useEffect(() => {
    const onPopState = () => setSearchText(readLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const search = useMemo(() => new URLSearchParams(searchText), [searchText]);
  const requestedView = search.get("view");
  const view: View = requestedView === "inspector" || requestedView === "players" || requestedView === "methodology"
    ? requestedView
    : "explorer";
  const updateSearch = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    });
    if (!next.get("view")) next.set("view", "explorer");
    const query = next.toString();
    window.history.pushState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    setSearchText(query ? `?${query}` : "");
  }, []);
  const changeView = (next: View) => {
    const updates: Record<string, string | null> = { view: next };
    if (next !== "inspector") {
      updates.decision = null;
      updates.option = null;
    }
    if (next !== "players") {
      updates.player_id = null;
      updates.compare_player_id = null;
    }
    updateSearch(updates);
  };

  return (
    <div className={`app-shell app-shell--${view}`}>
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => changeView("explorer")} aria-label="Open Review Explorer">
          <span className="brand__mark">PS</span><span><strong>Pass Selection</strong><small>Analytics</small></span>
        </button>
        <nav aria-label="Primary navigation">
          <div className="nav-cluster" aria-label="Analyst workspace">
            <button type="button" className={view === "explorer" ? "is-current" : ""} aria-current={view === "explorer" ? "page" : undefined} onClick={() => changeView("explorer")}>Review Explorer</button>
            <button type="button" className={view === "inspector" ? "is-current" : ""} aria-current={view === "inspector" ? "page" : undefined} onClick={() => changeView("inspector")}>Pass Inspector</button>
            <button type="button" className={view === "players" ? "is-current" : ""} aria-current={view === "players" ? "page" : undefined} onClick={() => changeView("players")}>Player Analysis</button>
          </div>
          <span className="nav-divider" aria-hidden="true" />
          <div className="nav-cluster nav-cluster--evidence" aria-label="Evidence and help">
            <button type="button" className={view === "methodology" ? "is-current" : ""} aria-current={view === "methodology" ? "page" : undefined} onClick={() => changeView("methodology")}>Methodology</button>
          </div>
        </nav>
        <span className="topbar__mode">Local · read-only data</span>
      </header>
      <main id="main-content" className="workspace">
        {view === "inspector" ? <PassInspector search={search} updateSearch={updateSearch} store={annotations} /> : null}
        {view === "players" ? <PlayerAnalysis search={search} updateSearch={updateSearch} store={annotations} /> : null}
        {view === "methodology" ? <Methodology /> : null}
        {view !== "inspector" && view !== "players" && view !== "methodology" ? <ReviewExplorer search={search} updateSearch={updateSearch} store={annotations} /> : null}
      </main>
      <footer className="app-footer">{footerByView[view] ?? footerByView.explorer}</footer>
    </div>
  );
}
