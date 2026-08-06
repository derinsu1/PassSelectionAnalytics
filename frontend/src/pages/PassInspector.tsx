import { useEffect, useMemo, useState } from "react";

import { useApi, usePlaybackApi } from "../api";
import { formatNumber, humanize } from "../format";
import { metricHelp } from "../metricHelp";
import type { DecisionDetails, MetadataResponse, PlaybackBundle, ReceiverOption, ReviewNavigationResponse } from "../types";
import type { AnnotationStore } from "../components/AnnotationControls";
import { AnnotationControls } from "../components/AnnotationControls";
import { CopyButton, EmptyState, ErrorState, LoadingBlock } from "../components/Common";
import { OptionTable } from "../components/OptionTable";
import { PlaybackViewer } from "../components/PlaybackViewer";
import type { PitchToggles } from "../components/PlaybackCanvas";
import { ExportMenu } from "../components/ExportMenu";
import { FixtureStrip } from "../components/FixtureStrip";
import { PlayerPortraitLink } from "../components/VisualIdentity";

type UpdateSearch = (updates: Record<string, string | null>) => void;

const defaultToggles: PitchToggles = {
  show_player_movement: true,
  show_player_labels: true,
  show_names: false,
  show_ids: false,
  show_option_labels: false,
  show_all_option_arrows: false,
  show_highest_pvi_arrow: true,
  show_ball_trail: false,
  show_defender_labels: false,
};

function halfLabel(period: number): string {
  if (period === 1) return "1st half";
  if (period === 2) return "2nd half";
  return `Period ${period}`;
}

export function PassInspector({ search, updateSearch, store }: { search: URLSearchParams; updateSearch: UpdateSearch; store: AnnotationStore }) {
  const decisionId = search.get("decision");
  const detail = useApi<DecisionDetails>(decisionId ? `/api/decisions/${encodeURIComponent(decisionId)}` : null);
  const metadata = useApi<MetadataResponse>("/api/metadata");
  const [timelineWindow, setTimelineWindow] = useState(30);
  const playback = usePlaybackApi<PlaybackBundle>(decisionId ? `/api/decisions/${encodeURIComponent(decisionId)}/playback?window=${timelineWindow}` : null);
  const [toggles, setToggles] = useState(defaultToggles);
  const [pitchView, setPitchView] = useState<"action" | "full">("full");
  const requestedOptionId = search.get("option");
  const navigationPath = useMemo(() => {
    if (!decisionId) return null;
    const parameters = new URLSearchParams(search);
    ["view", "decision", "annotation_status", "page", "page_size", "queue", "integrity_status", "arrow_verified"].forEach((key) => parameters.delete(key));
    if (parameters.get("sort_by") === "integrity") parameters.set("sort_by", "minute");
    return `/api/review-navigation?${parameters.toString()}`;
  }, [decisionId, search]);
  const navigation = useApi<ReviewNavigationResponse>(navigationPath);

  useEffect(() => {
    setTimelineWindow(30);
  }, [decisionId]);
  useEffect(() => {
    if (!detail.data || !requestedOptionId) return;
    if (!detail.data.options.some((option) => option.option_id === requestedOptionId)) updateSearch({ option: null });
  }, [detail.data, requestedOptionId, updateSearch]);
  if (!decisionId) return <EmptyState title="Choose a decision to inspect."><button type="button" className="button button--primary" onClick={() => updateSearch({ view: "explorer" })}>Open Review Explorer</button></EmptyState>;
  if (detail.error) return <ErrorState error={detail.error} retry={() => window.location.reload()} />;
  if (playback.error) return <ErrorState error={playback.error} retry={() => window.location.reload()} />;
  if (detail.loading || playback.loading || !playback.data) return <div className="page-stack"><LoadingBlock label="Loading pass inspector playback" /><LoadingBlock /></div>;
  if (!detail.data) return null;
  const data = detail.data;
  const activeOption = data.options.find((option) => option.option_id === requestedOptionId) ?? data.highest_pvi_receiver ?? data.selected_receiver ?? data.options[0] ?? null;
  const activeOptionId = activeOption?.option_id ?? null;
  const currentIndex = navigation.data?.decision_ids.indexOf(decisionId) ?? -1;
  const previous = currentIndex > 0 ? navigation.data?.decision_ids[currentIndex - 1] : null;
  const next = currentIndex >= 0 && navigation.data && currentIndex < navigation.data.decision_ids.length - 1 ? navigation.data.decision_ids[currentIndex + 1] : null;
  const selectOption = (option: ReceiverOption) => updateSearch({ option: option.option_id });
  const showDecision = (id: string) => updateSearch({ decision: id, option: null });
  const playerAnalysisHref = (playerId: number) => `?view=players&player_id=${playerId}`;
  const teamExplorerHref = (teamId: number) => `?view=explorer&team_id=${teamId}`;
  const fixture = metadata.data?.filter_options.matches.find((match) => match.id === data.summary.match_id) ?? null;

  return <div className="page-stack inspector">
    <FixtureStrip match={fixture} teamHref={teamExplorerHref} variant="hero" />
    <header className="inspector-header"><div className="decision-identity"><PlayerPortraitLink playerId={data.summary.passer_id} playerName={data.summary.passer_name} href={playerAnalysisHref(data.summary.passer_id)} className="player-portrait player-portrait--hero" /><div><p className="eyebrow">Detailed pass inspector</p><h1><a className="row-link" href={playerAnalysisHref(data.summary.passer_id)}>{data.summary.passer_name}</a> <span>to</span> <a className="row-link" href={playerAnalysisHref(data.summary.selected_receiver_id)}>{data.summary.selected_receiver_name}</a></h1><p>{data.summary.match_name} · {halfLabel(data.summary.period)} · {data.summary.match_clock} · <code>{data.summary.decision_id}</code></p></div><PlayerPortraitLink playerId={data.summary.selected_receiver_id} playerName={data.summary.selected_receiver_name} href={playerAnalysisHref(data.summary.selected_receiver_id)} className="player-portrait player-portrait--hero" /></div><div className="inspector-header__actions"><button type="button" className="button button--secondary" onClick={() => updateSearch({ view: "explorer", decision: null })}>Return to explorer</button><CopyButton label="Copy decision ID" text={data.summary.decision_id} /><CopyButton label="Copy direct link" text={window.location.href} /><ExportMenu title="Pass Inspector" request={{ scope: "pass_inspector", decision_id: data.summary.decision_id, timeline_window: timelineWindow }} annotations={store.values} /></div></header>

    <div className="inspector-layout"><main className="inspector-main"><PlaybackViewer bundle={playback.data} detail={data} toggles={toggles} setToggles={setToggles} activeOptionId={activeOptionId} onSelectOption={selectOption} pitchView={pitchView} setPitchView={setPitchView} jumpRequest={null} /></main><aside className="inspector-side"><PassComparison selected={data.selected_receiver} inspected={activeOption} playerHref={playerAnalysisHref} /><AnnotationControls decisionId={decisionId} store={store} /></aside></div>

    <section className="panel options-panel"><div className="panel-heading"><div><p className="eyebrow">Linked receiver options</p><h2>All {data.option_count} teammate candidates at the actual pass frame</h2></div></div><OptionTable options={data.options} activeOptionId={activeOptionId} onSelect={selectOption} playerHref={playerAnalysisHref} /></section>

    <nav className="decision-navigation" aria-label="Filtered decision navigation"><button type="button" className="button button--secondary" disabled={!previous} onClick={() => previous && showDecision(previous)}>Previous decision</button><span>{currentIndex >= 0 && navigation.data ? `${currentIndex + 1} of ${navigation.data.total.toLocaleString()} in active filtered order` : "Loading filtered navigation"}</span><button type="button" className="button button--secondary" disabled={!next} onClick={() => next && showDecision(next)}>Next decision</button></nav>
  </div>;
}

export function PassComparison({ selected, inspected, playerHref }: { selected: ReceiverOption | null; inspected: ReceiverOption | null; playerHref: (playerId: number) => string }) {
  if (!selected || !inspected) return <section className="panel comparison-panel"><p className="eyebrow">Pass comparison</p><h2>Unavailable</h2></section>;
  const isSameOption = selected.option_id === inspected.option_id;
  const metrics: Array<{ label: string; help: string; selected: string; inspected: string }> = [
    { label: "Local xT v1", help: metricHelp.sameFrameOpenXt, selected: formatNumber(selected.same_frame.open_xt, 5), inspected: formatNumber(inspected.same_frame.open_xt, 5) },
    { label: "Δ xT", help: metricHelp.sameFrameDeltaXt, selected: formatNumber(selected.same_frame.delta_xt, 5), inspected: formatNumber(inspected.same_frame.delta_xt, 5) },
    { label: "Local xT rank", help: metricHelp.sameFrameRank, selected: selected.same_frame.rank?.toString() ?? "N/A", inspected: inspected.same_frame.rank?.toString() ?? "N/A" },
    { label: "Δ vs selected", help: metricHelp.deltaSelected, selected: formatNumber(0, 5), inspected: formatNumber(inspected.same_frame.difference_from_selected, 5) },
    { label: "Local xPass", help: metricHelp.localXPass, selected: formatNumber(selected.local_xpass.xpass, 4), inspected: formatNumber(inspected.local_xpass.xpass, 4) },
    { label: "Local xPass rank", help: metricHelp.localXPassRank, selected: selected.local_xpass.rank?.toString() ?? "N/A", inspected: inspected.local_xpass.rank?.toString() ?? "N/A" },
    { label: "Availability", help: metricHelp.availability, selected: formatNumber(selected.local_xpass.availability_score, 3), inspected: formatNumber(inspected.local_xpass.availability_score, 3) },
    { label: "PVI", help: metricHelp.passViability, selected: formatNumber(selected.pass_viability.score, 2), inspected: formatNumber(inspected.pass_viability.score, 2) },
    { label: "PVI rank", help: metricHelp.pviRank, selected: selected.pass_viability.rank?.toString() ?? "N/A", inspected: inspected.pass_viability.rank?.toString() ?? "N/A" },
    { label: "PVI xT utility", help: metricHelp.pviXtUtility, selected: formatNumber(selected.pass_viability.xt_utility, 3), inspected: formatNumber(inspected.pass_viability.xt_utility, 3) },
  ];
  const issues = [selected, ...(isSameOption ? [] : [inspected])].flatMap((option) => {
    const prefix = option.is_selected ? "Selected pass" : `Inspected pass (${option.receiver_name})`;
    const messages: string[] = [];
    if (!option.same_frame.has_valid_location) messages.push(`${prefix}: ${humanize(option.same_frame.invalid_reason ?? "actual-frame location unavailable")}.`);
    if (option.same_frame.coordinate_in_playing_area === false) messages.push(`${prefix}: ${formatNumber(option.same_frame.out_of_bounds_distance_m, 2)} m outside the pitch; Local xT v1 uses the nearest boundary.`);
    if (!option.local_xpass.eligible) messages.push(`${prefix}: Local xPass ${humanize(option.local_xpass.invalid_reason ?? "unavailable")}.`);
    if (!option.pass_viability.eligible) messages.push(`${prefix}: PVI ${humanize(option.pass_viability.invalid_reason ?? "unavailable")}.`);
    return messages;
  });
  const inspectedRole = inspected.is_highest_pvi ? "Highest PVI" : "Inspected pass";
  return <section className="panel comparison-panel" aria-live="polite"><div className="panel-heading"><div><p className="eyebrow">Pass comparison</p><h2>{isSameOption ? "Inspected pass is the selected pass" : "Selected pass vs inspected pass"}</h2></div><span className="panel-note">{inspectedRole}</span></div><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th scope="col">Metric</th><th scope="col"><span>Selected pass</span><span className="identity-cell"><PlayerPortraitLink playerId={selected.receiver_id} playerName={selected.receiver_name} href={playerHref(selected.receiver_id)} className="player-portrait player-portrait--comparison" /><a className="row-link" href={playerHref(selected.receiver_id)}>{selected.receiver_name}</a></span></th>{isSameOption ? null : <th scope="col"><span>{inspectedRole}</span><span className="identity-cell"><PlayerPortraitLink playerId={inspected.receiver_id} playerName={inspected.receiver_name} href={playerHref(inspected.receiver_id)} className="player-portrait player-portrait--comparison" /><a className="row-link" href={playerHref(inspected.receiver_id)}>{inspected.receiver_name}</a></span></th>}</tr></thead><tbody>{metrics.map((metric) => <tr key={metric.label} className={metric.label === "PVI" ? "is-pvi" : undefined}><th scope="row"><span className="metric-label">{metric.label}<span className="metric-tooltip">{metric.help}</span></span></th><td>{metric.selected}</td>{isSameOption ? null : <td>{metric.inspected}</td>}</tr>)}</tbody></table></div>{issues.length > 0 ? <ul className="comparison-issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}<p className="method-note">Actual-frame comparison across tracked teammates. PVI and Local xT v1 are review prompts, not pass-selection verdicts.</p></section>;
}
