import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useApi } from "../api";
import { formatNumber, formatOrdinal, formatPercent, humanize } from "../format";
import type {
  MatchOption,
  MetadataResponse,
  PlayerMatchStats,
  PlayerPercentile,
  PlayerStatSummary,
  PlayerStatsDetailResponse,
  PlayerStatsDirectoryResponse,
} from "../types";
import { EmptyState, ErrorState, LoadingBlock, MetricLabel } from "../components/Common";
import { PercentileGauge } from "../components/PercentileGauge";
import { ExportMenu } from "../components/ExportMenu";
import type { AnnotationStore } from "../components/AnnotationControls";
import { AnnotationControls } from "../components/AnnotationControls";
import { FixtureStrip } from "../components/FixtureStrip";
import { RangeControl } from "../components/RangeControl";
import { ClubBadgeLink, PlayerPortrait, PlayerPortraitLink } from "../components/VisualIdentity";

type UpdateSearch = (updates: Record<string, string | null>) => void;
type PlayerSort = "minutes" | "passes_per90" | "completion_rate" | "local_xpass" | "availability" | "pvi" | "pvi_best_rate" | "higher_open_xt_per90" | "targets_per90" | "target_completion_rate" | "percentile";

const playerSorts = new Set<PlayerSort>(["minutes", "passes_per90", "completion_rate", "local_xpass", "availability", "pvi", "pvi_best_rate", "higher_open_xt_per90", "targets_per90", "target_completion_rate", "percentile"]);
const percentileRange = { minimum: 0, maximum: 100, step: 1 };

const PLAYER_METRIC_HELP: Record<string, string> = {
  passes_per90: "Observed selected pass attempts, scaled to 90 source regular-time minutes.",
  completions_per90: "Successful observed selected passes, scaled to 90 source regular-time minutes.",
  completion_rate: "Successful selected passes divided by successful plus unsuccessful passes; offsides are excluded.",
  local_xpass: "Project-owned completion estimate for the observed pass at the actual pass frame, conditional on attempting that pass.",
  availability: "Project-owned actual-frame lane and interception proxy for the observed pass; it is not an observed outcome.",
  mean_local_xpass_rank: "Mean rank of the selected receiver by Local xPass among actual-frame teammates. Lower rank is stronger.",
  pvi: "Project-owned 65% Local xPass and 35% bounded actual-frame delta-xT utility score. Availability is a visible local lane-risk diagnostic, not a PVI input. It is not a player rating.",
  pvi_best_rate: "Share of eligible selected passes where the selected receiver was best by the project-owned PVI at the actual pass frame.",
  mean_pvi_gap: "Mean best-teammate PVI minus selected-receiver PVI for eligible decisions. Lower is stronger.",
  expected_completions_per90: "Sum of eligible selected-pass Local xPass values, scaled to 90 regular-time minutes.",
  completion_above_expected_per90: "Observed successful eligible passes minus expected completions, scaled to 90 regular-time minutes.",
  higher_open_xt_alternative_rate: "Share of eligible actual-frame decisions with an unambiguous higher open-xT tracked teammate. Requires two valid tracked locations and a 0.010 margin. Lower is stronger.",
  higher_open_xt_per90: "Eligible higher open-xT alternatives across all tracked teammates, scaled to 90 regular-time minutes. Lower is stronger.",
  mean_higher_open_xt_margin: "Mean actual-frame open-xT advantage of eligible higher open-xT teammates. Lower is stronger.",
  targets_per90: "Observed teammate passes targeted to this player, scaled to 90 source regular-time minutes.",
  successful_receptions_per90: "Successful teammate passes targeted to this player, scaled to 90 source regular-time minutes.",
  target_completion_rate: "Successful targeted passes divided by successful plus unsuccessful targeted passes; offsides are excluded.",
  target_local_xpass: "Mean Local xPass of teammate passes that actually targeted this player.",
  target_availability: "Mean Availability of teammate passes that actually targeted this player.",
  target_pvi: "Mean PVI of teammate passes that actually targeted this player.",
};

const COMPARISON_OVERVIEW_METRICS = ["passes_per90", "completion_rate", "local_xpass", "availability", "pvi"];
const COMPARISON_GROUPS = [
  { eyebrow: "Risk and execution", title: "Selected passes", metrics: ["mean_local_xpass_rank", "completions_per90", "expected_completions_per90", "completion_above_expected_per90"] },
  { eyebrow: "Selection and attack", title: "Actual-frame alternatives", metrics: ["pvi_best_rate", "mean_pvi_gap", "higher_open_xt_alternative_rate", "higher_open_xt_per90", "mean_higher_open_xt_margin"] },
  { eyebrow: "Receiving", title: "Passes teammates selected to this player", metrics: ["targets_per90", "successful_receptions_per90", "target_completion_rate", "target_local_xpass", "target_availability", "target_pvi"] },
];

function playerMetricHelp(metric: string | undefined) {
  return metric ? PLAYER_METRIC_HELP[metric] : undefined;
}

function queryId(search: URLSearchParams, key: string): number | null {
  const raw = search.get(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function matchIncludesTeam(match: MatchOption, teamId: number) {
  return match.home_team_id === teamId || match.away_team_id === teamId;
}

function playerHref(search: URLSearchParams, playerId: number) {
  const parameters = new URLSearchParams(search);
  parameters.set("view", "players");
  parameters.set("player_id", String(playerId));
  return `?${parameters.toString()}`;
}

function teamExplorerHref(teamId: number) {
  return `?view=explorer&team_id=${teamId}`;
}

function playerPath(
  matchId: number | null,
  teamId: number | null,
  searchText: string,
  hideUnder60: boolean,
  position: string | null,
  percentileMetric: string,
  minPercentile: string,
  maxPercentile: string,
  sortBy: PlayerSort,
  sortDirection: "asc" | "desc",
) {
  const parameters = new URLSearchParams();
  if (matchId !== null) parameters.set("match_id", String(matchId));
  if (teamId !== null) parameters.set("team_id", String(teamId));
  if (searchText) parameters.set("search", searchText);
  if (position) parameters.set("position", position);
  parameters.set("hide_under_60", String(hideUnder60));
  parameters.set("percentile_metric", percentileMetric);
  if (minPercentile) parameters.set("min_percentile", minPercentile);
  if (maxPercentile) parameters.set("max_percentile", maxPercentile);
  parameters.set("sort_by", sortBy);
  parameters.set("sort_direction", sortDirection);
  return `/api/player-stats?${parameters.toString()}`;
}

function detailPath(playerId: number, matchId: number | null, teamId: number | null) {
  const parameters = new URLSearchParams();
  if (matchId !== null) parameters.set("match_id", String(matchId));
  if (teamId !== null) parameters.set("team_id", String(teamId));
  const suffix = parameters.toString();
  return `/api/player-stats/${playerId}${suffix ? `?${suffix}` : ""}`;
}

function comparisonDirectoryPath() {
  return playerPath(null, null, "", false, null, "pvi", "", "", "minutes", "desc");
}

export function PlayerAnalysis({ search, updateSearch, store }: { search: URLSearchParams; updateSearch: UpdateSearch; store: AnnotationStore }) {
  const [isDirectoryRefinementOpen, setIsDirectoryRefinementOpen] = useState(() => ["player_position", "player_percentile_metric", "player_min_percentile", "player_max_percentile"].some((key) => search.has(key)));
  const metadata = useApi<MetadataResponse>("/api/metadata");
  const selectedPlayerId = queryId(search, "player_id");
  const comparisonPlayerId = queryId(search, "compare_player_id");
  const selectedMatchId = queryId(search, "player_match_id");
  const selectedTeamId = queryId(search, "player_team_id");
  const playerSearch = search.get("player_search") ?? "";
  const hideUnder60 = search.get("player_hide_under_60") !== "false";
  const selectedPosition = search.get("player_position");
  const percentileMetric = search.get("player_percentile_metric") ?? "pvi";
  const minPercentile = search.get("player_min_percentile") ?? "";
  const maxPercentile = search.get("player_max_percentile") ?? "";
  const requestedSort = search.get("player_sort") as PlayerSort | null;
  const hasPercentileFilter = minPercentile !== "" || maxPercentile !== "";
  const sortBy = requestedSort && playerSorts.has(requestedSort) ? requestedSort : (hasPercentileFilter ? "percentile" : "minutes");
  const sortDirection = search.get("player_sort_direction") === "asc" ? "asc" : "desc";
  const allMatches = metadata.data?.filter_options.matches ?? [];
  const allTeams = metadata.data?.filter_options.teams ?? [];
  const selectedMatch = allMatches.find((match) => match.id === selectedMatchId) ?? null;
  const incompatibleScope = Boolean(selectedMatch && selectedTeamId !== null && !matchIncludesTeam(selectedMatch, selectedTeamId));
  const effectiveTeamId = incompatibleScope ? null : selectedTeamId;
  const matchOptions = useMemo(
    () => effectiveTeamId === null ? allMatches : allMatches.filter((match) => matchIncludesTeam(match, effectiveTeamId)),
    [allMatches, effectiveTeamId],
  );
  const teamOptions = useMemo(
    () => selectedMatch ? allTeams.filter((team) => matchIncludesTeam(selectedMatch, team.id)) : allTeams,
    [allTeams, selectedMatch],
  );
  const directory = useApi<PlayerStatsDirectoryResponse>(
    playerPath(
      selectedMatchId,
      effectiveTeamId,
      playerSearch,
      hideUnder60,
      selectedPosition,
      percentileMetric,
      minPercentile,
      maxPercentile,
      sortBy,
      sortDirection,
    ),
  );
  const detail = useApi<PlayerStatsDetailResponse>(
    selectedPlayerId === null ? null : detailPath(selectedPlayerId, selectedMatchId, effectiveTeamId),
  );
  const comparisonDirectory = useApi<PlayerStatsDirectoryResponse>(
    selectedPlayerId === null ? null : comparisonDirectoryPath(),
  );
  const comparisonDetail = useApi<PlayerStatsDetailResponse>(
    comparisonPlayerId === null || comparisonPlayerId === selectedPlayerId ? null : detailPath(comparisonPlayerId, null, null),
  );

  useEffect(() => {
    if (metadata.data && incompatibleScope) updateSearch({ player_team_id: null });
  }, [incompatibleScope, metadata.data, updateSearch]);

  useEffect(() => {
    if (comparisonPlayerId !== null && (comparisonPlayerId === selectedPlayerId || comparisonDetail.error)) {
      updateSearch({ compare_player_id: null });
    }
  }, [comparisonDetail.error, comparisonPlayerId, selectedPlayerId, updateSearch]);

  const setScope = (key: "player_match_id" | "player_team_id", value: string) => {
    let nextMatchId = selectedMatchId;
    let nextTeamId = selectedTeamId;
    const parsed = Number(value);
    const nextValue = Number.isSafeInteger(parsed) ? parsed : null;
    if (key === "player_match_id") nextMatchId = nextValue;
    else nextTeamId = nextValue;
    if (nextMatchId !== null && nextTeamId !== null) {
      const match = allMatches.find((item) => item.id === nextMatchId);
      if (!match || !matchIncludesTeam(match, nextTeamId)) {
        if (key === "player_match_id") nextTeamId = null;
        else nextMatchId = null;
      }
    }
    updateSearch({
      player_match_id: nextMatchId === null ? null : String(nextMatchId),
      player_team_id: nextTeamId === null ? null : String(nextTeamId),
    });
  };
  const setPlayerFilter = (key: string, value: string | null) => updateSearch({ [key]: value, ...(["player_percentile_metric", "player_min_percentile", "player_max_percentile"].includes(key) ? { player_sort: null, player_sort_direction: null } : {}) });
  const selectPlayerSort = (next: PlayerSort) => updateSearch({ player_sort: next, player_sort_direction: sortBy === next && sortDirection === "desc" ? "asc" : "desc" });

  if (metadata.loading || directory.loading && !directory.data) {
    return <div className="page-stack"><LoadingBlock label="Loading Player Analysis" /><LoadingBlock /></div>;
  }
  if (metadata.error) return <ErrorState error={metadata.error} retry={() => window.location.reload()} />;
  if (directory.error) return <ErrorState error={directory.error} retry={() => window.location.reload()} />;
  if (!metadata.data || !directory.data) return null;

  if (selectedPlayerId !== null) {
    if (detail.loading && !detail.data) return <div className="page-stack"><LoadingBlock label="Loading player profile" /><LoadingBlock /></div>;
    if (detail.error) return <ErrorState error={detail.error} retry={() => window.location.reload()} />;
    if (comparisonPlayerId !== null && comparisonDetail.loading && !comparisonDetail.data) return <div className="page-stack"><LoadingBlock label="Loading comparison player" /><LoadingBlock /></div>;
    if (detail.data) return <PlayerProfile profile={detail.data} comparison={comparisonDetail.data} comparisonPlayers={comparisonDirectory.data?.items ?? []} matches={metadata.data.filter_options.matches} updateSearch={updateSearch} store={store} filters={directory.data.applied_filters} />;
  }

  return (
    <div className="page-stack player-analysis">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Available-match player sample</p>
          <h1>Player Analysis</h1>
          <p>Passing and receiving profiles from the local matches only. Positional percentiles are fixed at build time against 60+ minute peers in the same primary position across all available matches and teams.</p>
        </div>
        <div><div className="page-intro__counts"><strong>{directory.data.total.toLocaleString()}</strong><span>players in view</span></div><ExportMenu title="Player Analysis" request={{ scope: "player_directory", player_filters: directory.data.applied_filters }} annotations={store.values} csv reportRowCount={directory.data.total} /></div>
      </section>

      <section className="filter-panel filter-panel--queue" aria-label="Player Analysis filters">
        <div className="panel-heading"><div><p className="eyebrow">Compare players</p><h2>Available-match membership</h2></div><button type="button" className="button button--quiet" onClick={() => updateSearch({ player_match_id: null, player_team_id: null, player_search: null, player_hide_under_60: null, player_position: null, player_percentile_metric: null, player_min_percentile: null, player_max_percentile: null, player_sort: null, player_sort_direction: null })}>Reset filters</button></div>
        <p className="filter-panel__guidance">Use membership to focus the directory. The displayed rates and percentiles remain anchored to the published all-match baseline.</p>
        <div className="filter-quick-grid player-filter-grid">
          <label><span className="filter-label-with-badge">Team{effectiveTeamId === null ? null : <ClubBadgeLink teamId={effectiveTeamId} teamName={teamOptions.find((team) => team.id === effectiveTeamId)?.label ?? "Selected club"} href={teamExplorerHref(effectiveTeamId)} />}</span><select value={effectiveTeamId ?? ""} onChange={(event) => setScope("player_team_id", event.target.value)}><option value="">All teams</option>{teamOptions.map((team) => <option key={team.id} value={team.id}>{team.label}</option>)}</select></label>
          <label>Match<select value={selectedMatchId ?? ""} onChange={(event) => setScope("player_match_id", event.target.value)}><option value="">All available matches</option>{matchOptions.map((match) => <option key={match.id} value={match.id}>{match.label}</option>)}</select></label>
          <label>Player search<input value={playerSearch} onChange={(event) => setPlayerFilter("player_search", event.target.value || null)} placeholder="Player name" /></label>
        </div>
        <details className="filter-disclosure" open={isDirectoryRefinementOpen} onToggle={(event) => setIsDirectoryRefinementOpen(event.currentTarget.open)}><summary><span>Directory refinement</span><span>Position and percentile range</span></summary><div className="filter-grid player-filter-grid">
          <label>Primary position<select value={selectedPosition ?? ""} onChange={(event) => setPlayerFilter("player_position", event.target.value || null)}><option value="">All primary positions</option>{directory.data.positions.map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
          <label>Percentile metric<select value={percentileMetric} onChange={(event) => setPlayerFilter("player_percentile_metric", event.target.value)}>{directory.data.percentile_metrics.map((metric) => <option key={metric.metric} value={metric.metric}>{metric.label}</option>)}</select></label>
          <RangeControl label="Positional percentile" minimumLabel="Minimum percentile" maximumLabel="Maximum percentile" minimumValue={minPercentile} maximumValue={maxPercentile} onMinimumChange={(value) => setPlayerFilter("player_min_percentile", value || null)} onMaximumChange={(value) => setPlayerFilter("player_max_percentile", value || null)} range={percentileRange} />
          <label className="checkbox-filter"><input type="checkbox" checked={hideUnder60} onChange={(event) => setPlayerFilter("player_hide_under_60", event.target.checked ? null : "false")} />Hide players under 60 minutes</label>
        </div></details>
      </section>

      <section className="panel player-directory-panel">
        <div className="panel-heading"><div><p className="eyebrow">Player directory</p><h2>{directory.data.total.toLocaleString()} available-match profiles</h2></div><span className="panel-note">Sorted by {hasPercentileFilter && !requestedSort ? "filtered percentile" : humanize(sortBy)} · {sortDirection === "desc" ? "highest" : "lowest"} first. Select a metric header to reorder.</span></div>
        {directory.data.items.length ? <PlayerDirectory items={directory.data.items} search={search} sortBy={sortBy} sortDirection={sortDirection} onSort={selectPlayerSort} /> : <EmptyState title="No players match the current filters."><p>Disable the low-minute filter or broaden the membership, position, or percentile range.</p></EmptyState>}
      </section>
    </div>
  );
}

function percentileClass(metric: PlayerPercentile | null) {
  if (metric?.percentile === null || metric === null) return "percentile-badge--unavailable";
  return metric.percentile < 34 ? "percentile-badge--low" : metric.percentile < 67 ? "percentile-badge--middle" : "percentile-badge--high";
}

function PlayerTableHeader({ label, metric, help, sortBy, sortDirection, onSort }: { label: string; metric?: PlayerSort; help?: string; sortBy?: PlayerSort; sortDirection?: "asc" | "desc"; onSort?: (metric: PlayerSort) => void }) {
  const content = <MetricLabel label={label} help={help ?? playerMetricHelp(metric)} />;
  return <th>{metric && onSort ? <button type="button" className="table-sort" onClick={() => onSort(metric)}>{content}{sortBy === metric ? ` ${sortDirection === "asc" ? "↑" : "↓"}` : ""}</button> : content}</th>;
}

function PlayerDirectory({ items, search, sortBy, sortDirection, onSort }: { items: PlayerStatSummary[]; search: URLSearchParams; sortBy: PlayerSort; sortDirection: "asc" | "desc"; onSort: (metric: PlayerSort) => void }) {
  return <div className="review-table-wrap"><table className="data-table player-directory-table"><thead><tr><th>Player</th><th>Team / role</th><th>Primary position</th><PlayerTableHeader label="Matches / min" metric="minutes" help="Available local matches and source regular-time minutes. Per-90 rates use these minutes as their denominator." sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Passes /90" metric="passes_per90" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Pass completion" metric="completion_rate" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Selected Local xPass" metric="local_xpass" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Availability" metric="availability" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Selected PVI" metric="pvi" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Frame-best PVI" metric="pvi_best_rate" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Higher open-xT /90" metric="higher_open_xt_per90" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Targets /90" metric="targets_per90" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Target completion" metric="target_completion_rate" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /><PlayerTableHeader label="Positional percentile" metric="percentile" help="Stored percentile against 60+ minute players in the same primary position across all available local matches. Green is stronger after applying the metric direction." sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></tr></thead><tbody>{items.map((player) => {
    const percentile = player.selected_percentile;
    return <tr key={`${player.team_id}:${player.player_id}`}><th scope="row"><span className="identity-cell"><PlayerPortraitLink playerId={player.player_id} playerName={player.player_name} href={playerHref(search, player.player_id)} className="player-portrait player-portrait--directory" /><span><a className="row-link" href={playerHref(search, player.player_id)}>{player.player_name}</a>{player.low_minutes_sample ? <span className="cell-subtle">Low-minute sample</span> : null}</span></span></th><td><span className="identity-cell"><ClubBadgeLink teamId={player.team_id} teamName={player.team_name} href={teamExplorerHref(player.team_id)} />{player.team_name}</span><span className="cell-subtle">{player.player_role}</span></td><td>{player.percentile_position}<span className="cell-subtle">Percentile cohort</span></td><td>{player.appearances}<span className="cell-subtle">{formatNumber(player.regular_minutes, 1)} min</span></td><td>{formatNumber(player.passing.attempts_per90, 1)}</td><td>{formatPercent(player.passing.completion_rate)}<span className="cell-subtle">{player.passing.successful}/{player.passing.resolved_attempts}</span></td><td>{formatNumber(player.passing.local_xpass, 3)}</td><td>{formatNumber(player.passing.availability, 3)}</td><td>{formatNumber(player.passing.pvi, 1)}</td><td>{formatPercent(player.passing.frame_best_pvi_selection_rate)}</td><td>{formatNumber(player.passing.higher_open_xt_alternatives_per90, 2)}</td><td>{formatNumber(player.receiving.targets_per90, 1)}</td><td>{formatPercent(player.receiving.target_completion_rate)}</td><td><span className={`percentile-badge ${percentileClass(percentile)}`}>{formatOrdinal(percentile?.percentile)}</span><span className="cell-subtle">{percentile?.label ?? "Percentile"} · {percentile?.peer_count ?? 0} peers</span></td></tr>;
  })}</tbody></table></div>;
}

function PlayerProfile({ profile, comparison, comparisonPlayers, matches, updateSearch, store, filters }: { profile: PlayerStatsDetailResponse; comparison: PlayerStatsDetailResponse | null; comparisonPlayers: PlayerStatSummary[]; matches: MatchOption[]; updateSearch: UpdateSearch; store: AnnotationStore; filters: PlayerStatsDirectoryResponse["applied_filters"] }) {
  const passing = profile.passing;
  const receiving = profile.receiving;
  const percentile = (metric: string) => profile.percentiles.find((item) => item.metric === metric);
  if (comparison) return <PlayerComparisonPage anchor={profile} comparison={comparison} players={comparisonPlayers} updateSearch={updateSearch} store={store} />;
  return <div className="page-stack player-profile">
    <header className="inspector-header player-profile-header"><div className="player-profile-identity"><PlayerPortrait playerId={profile.player_id} playerName={profile.player_name} className="player-portrait player-portrait--profile" /><div><p className="eyebrow">Available-match player profile</p><h1>{profile.player_name}</h1><p><span className="club-name-with-badge"><ClubBadgeLink teamId={profile.team_id} teamName={profile.team_name} href={teamExplorerHref(profile.team_id)} />{profile.team_name}</span> · {profile.player_role} · primary position: {profile.percentile_position} · {profile.appearances} appearances · {formatNumber(profile.regular_minutes, 1)} regular-time minutes</p></div></div><div className="inspector-header__actions"><button type="button" className="button button--secondary" onClick={() => updateSearch({ player_id: null, compare_player_id: null })}>Back to all players</button><ComparisonPicker anchor={profile} players={comparisonPlayers} updateSearch={updateSearch} /><ExportMenu title="Player Profile" request={{ scope: "player_profile", player_id: profile.player_id, player_filters: filters }} annotations={store.values} /></div></header>
    <p className="method-note">All profile rates and positional percentiles use all available local matches. Team and Match only limit visible membership and source rows. Pass completion excludes offsides from its denominator. Local-xPass execution is descriptive: this v0 model was trained on the same small available-match sample.</p>

    <section className="metric-grid" aria-label="Player passing overview"><ProfileMetric label="Passes /90" value={formatNumber(passing.attempts_per90, 1)} detail={`${passing.attempts} observed attempts`} percentile={percentile("passes_per90")} position={profile.percentile_position} /><ProfileMetric label="Pass completion" value={formatPercent(passing.completion_rate)} detail={`${passing.successful}/${passing.resolved_attempts}; ${passing.offside} offside`} percentile={percentile("completion_rate")} position={profile.percentile_position} /><ProfileMetric label="Selected Local xPass" value={formatNumber(passing.local_xpass, 3)} detail={`${passing.local_xpass_coverage} eligible selections`} percentile={percentile("local_xpass")} position={profile.percentile_position} /><ProfileMetric label="Selected Availability" value={formatNumber(passing.availability, 3)} detail="Actual-frame lane proxy" percentile={percentile("availability")} position={profile.percentile_position} /><ProfileMetric label="Selected PVI" value={formatNumber(passing.pvi, 1)} detail={`${passing.pvi_coverage} complete inputs`} percentile={percentile("pvi")} position={profile.percentile_position} /></section>

    <div className="dashboard-grid dashboard-grid--two player-profile-grid">
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Risk and execution</p><h2>Selected passes</h2></div></div><dl className="definition-grid"><ProfileDefinition term="Mean Local xPass rank" percentile={percentile("mean_local_xpass_rank")} position={profile.percentile_position}>{formatNumber(passing.mean_local_xpass_rank, 2)} / 10</ProfileDefinition><ProfileDefinition term="Completed passes /90" percentile={percentile("completions_per90")} position={profile.percentile_position}>{formatNumber(passing.completions_per90, 2)}</ProfileDefinition><ProfileDefinition term="Expected completions /90" help="Expected completions across reliable, eligible observed passes, scaled to 90 regular-time minutes." percentile={percentile("expected_completions_per90")} position={profile.percentile_position}>{formatNumber(passing.expected_completions_per90, 2)}<span className="cell-subtle">{formatNumber(passing.expected_completions, 2)} total · {passing.execution_eligible_count} reliable, eligible passes</span></ProfileDefinition><ProfileDefinition term="Above expected /90" help="Observed successful eligible passes minus expected completions, scaled to 90 regular-time minutes." percentile={percentile("completion_above_expected_per90")} position={profile.percentile_position}>{formatNumber(passing.completion_above_expected_per90, 2)}<span className="cell-subtle">{formatNumber(passing.completion_above_expected, 2)} total above expected</span></ProfileDefinition></dl></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Selection and attack</p><h2>Actual-frame alternatives</h2></div></div><dl className="definition-grid"><ProfileDefinition term="Frame-best PVI selection" percentile={percentile("pvi_best_rate")} position={profile.percentile_position}>{formatPercent(passing.frame_best_pvi_selection_rate)}<span className="cell-subtle">{passing.pvi_coverage} eligible selections</span></ProfileDefinition><ProfileDefinition term="Mean PVI gap" percentile={percentile("mean_pvi_gap")} position={profile.percentile_position}>{formatNumber(passing.mean_pvi_gap, 2)}<span className="cell-subtle">Highest PVI minus selected</span></ProfileDefinition><ProfileDefinition term="Higher open-xT alternative rate" help="Share of eligible decisions with an unambiguous tracked teammate at least 0.010 higher in open xT." percentile={percentile("higher_open_xt_alternative_rate")} position={profile.percentile_position}>{formatPercent(passing.higher_open_xt_alternative_rate)}<span className="cell-subtle">{passing.higher_open_xt_alternative_count} total · {passing.attacking_eligible_count} eligible decisions</span></ProfileDefinition><ProfileDefinition term="Higher open-xT alternatives /90" percentile={percentile("higher_open_xt_per90")} position={profile.percentile_position}>{formatNumber(passing.higher_open_xt_alternatives_per90, 2)}</ProfileDefinition><ProfileDefinition term="Mean higher open-xT margin" percentile={percentile("mean_higher_open_xt_margin")} position={profile.percentile_position}>{formatNumber(passing.mean_higher_open_xt_margin, 4)}<span className="cell-subtle">Actual-frame local value proxy</span></ProfileDefinition></dl></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Receiving</p><h2>Passes teammates selected to this player</h2></div></div><dl className="definition-grid"><ProfileDefinition term="Targets /90" percentile={percentile("targets_per90")} position={profile.percentile_position}>{formatNumber(receiving.targets_per90, 1)}<span className="cell-subtle">{receiving.targets} targets</span></ProfileDefinition><ProfileDefinition term="Successful receptions /90" percentile={percentile("successful_receptions_per90")} position={profile.percentile_position}>{formatNumber(receiving.successful_receptions_per90, 1)}</ProfileDefinition><ProfileDefinition term="Target completion" percentile={percentile("target_completion_rate")} position={profile.percentile_position}>{formatPercent(receiving.target_completion_rate)}<span className="cell-subtle">{receiving.successful}/{receiving.resolved_targets}; {receiving.offside} offside</span></ProfileDefinition><ProfileDefinition term="Target Local xPass" percentile={percentile("target_local_xpass")} position={profile.percentile_position}>{formatNumber(receiving.local_xpass, 3)}</ProfileDefinition><ProfileDefinition term="Target Availability" percentile={percentile("target_availability")} position={profile.percentile_position}>{formatNumber(receiving.availability, 3)}</ProfileDefinition><ProfileDefinition term="Target PVI" percentile={percentile("target_pvi")} position={profile.percentile_position}>{formatNumber(receiving.pvi, 1)}</ProfileDefinition></dl></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Sample guard</p><h2>Interpretation boundary</h2></div></div><p>{profile.low_minutes_sample ? "This profile is below 60 available-match minutes. It is excluded from every percentile peer cohort, but its percentile values remain visible against the eligible 60+ minute players in its primary position." : "This profile is part of the 60+ minute positional peer cohorts used for percentiles."}</p><p className="provider-note">Higher-xT alternatives describe a same-frame location-value condition, not a claim that the observed pass was wrong. PVI blends Local xPass with bounded same-frame delta xT; it is not a player rating. Percentiles compare players in the same primary position, while per-90 values account for different playing time.</p></section>
    </div>

    <section className="panel percentile-table-panel"><div className="panel-heading"><div><p className="eyebrow">Complete fixed baseline</p><h2>All positional percentiles</h2></div><span className="panel-note">Raw value, direction, and metric-specific cohort</span></div><AllPercentiles metrics={profile.percentiles} /></section>

    <AnnotationControls playerId={profile.player_id} store={store} />

    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Auditable source rows</p><h2>Available-match breakdown</h2></div></div><MatchBreakdown rows={profile.match_breakdown} matches={matches} /></section>
  </div>;
}

function ComparisonPicker({ anchor, players, updateSearch }: { anchor: PlayerStatSummary; players: PlayerStatSummary[]; updateSearch: UpdateSearch }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return players.filter((player) => player.player_id !== anchor.player_id && player.player_name.toLocaleLowerCase().includes(needle)).sort((left, right) => left.player_name.localeCompare(right.player_name)).slice(0, 8);
  }, [anchor.player_id, players, query]);
  const select = (player: PlayerStatSummary) => {
    setQuery("");
    setOpen(false);
    updateSearch({ compare_player_id: String(player.player_id) });
  };
  return <div className="comparison-picker"><button type="button" className="button button--secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="comparison-player-search">Compare with…</button>{open ? <div className="comparison-picker__popover"><label htmlFor="comparison-player-search">Find a player</label><input id="comparison-player-search" role="combobox" aria-autocomplete="list" aria-expanded={matches.length > 0} aria-controls="comparison-player-options" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a player name" />{query.trim() ? <ul id="comparison-player-options" role="listbox">{matches.length ? matches.map((player) => <li key={player.player_id} role="option" aria-selected={false}><button type="button" onClick={() => select(player)}><PlayerPortrait playerId={player.player_id} playerName={player.player_name} className="player-portrait player-portrait--mini" /><span><strong>{player.player_name}</strong><small>{player.team_name} · {player.percentile_position} · {formatNumber(player.regular_minutes, 0)} min</small></span></button></li>) : <li className="comparison-picker__empty">No other published player matches that name.</li>}</ul> : <p className="panel-note">Search all available player profiles.</p>}</div> : null}</div>;
}

function PlayerComparisonPage({ anchor, comparison, players, updateSearch, store }: { anchor: PlayerStatsDetailResponse; comparison: PlayerStatsDetailResponse; players: PlayerStatSummary[]; updateSearch: UpdateSearch; store: AnnotationStore }) {
  const samePosition = anchor.percentile_position === comparison.percentile_position;
  return <div className="page-stack player-comparison">
    <header className="inspector-header player-comparison-header"><div><p className="eyebrow">Available-match player comparison</p><h1>{anchor.player_name} <span>vs</span> {comparison.player_name}</h1><p>Fixed all-match rates and positional percentiles. The comparison player is shown relative to the viewed player.</p></div><div className="inspector-header__actions"><button type="button" className="button button--secondary" onClick={() => updateSearch({ compare_player_id: null })}>Back to profile</button><ComparisonPicker anchor={anchor} players={players} updateSearch={updateSearch} /><button type="button" className="button button--quiet" onClick={() => updateSearch({ player_id: comparison.player_id === anchor.player_id ? null : String(comparison.player_id), compare_player_id: null })}>Open {comparison.player_name}</button><ExportMenu title="Player Comparison" request={{ scope: "player_comparison", player_id: anchor.player_id, comparison_player_id: comparison.player_id }} annotations={store.values} csv /></div></header>
    <section className="player-comparison__identities" aria-label="Compared players"><ComparisonIdentity player={anchor} role="Viewed player" /><ComparisonIdentity player={comparison} role="Comparison player" /></section>
    <p className="method-note">{samePosition ? `Both players use the ${anchor.percentile_position} positional cohort for their percentiles.` : `${anchor.player_name} and ${comparison.player_name} have separate primary-position cohorts. Their raw values can be compared directly; each percentile remains specific to that player's own cohort.`}</p>
    <section className="comparison-overview" aria-label="Comparison overview">{COMPARISON_OVERVIEW_METRICS.map((metric) => <ComparisonOverviewMetric key={metric} metric={comparisonMetric(anchor, metric)} comparisonMetric={comparisonMetric(comparison, metric)} />)}</section>
    <div className="dashboard-grid dashboard-grid--two comparison-groups">{COMPARISON_GROUPS.map((group) => <ComparisonGroup key={group.title} {...group} anchor={anchor} comparison={comparison} />)}</div>
    <section className="panel percentile-table-panel"><div className="panel-heading"><div><p className="eyebrow">Complete fixed baseline</p><h2>All 20 metrics</h2></div><span className="panel-note">Difference = comparison player − viewed player</span></div><ComparisonTable anchor={anchor} comparison={comparison} metrics={anchor.percentiles.map((metric) => metric.metric)} /></section>
  </div>;
}

function ComparisonIdentity({ player, role }: { player: PlayerStatsDetailResponse; role: string }) {
  return <article className="comparison-identity"><PlayerPortrait playerId={player.player_id} playerName={player.player_name} className="player-portrait player-portrait--comparison" /><div><p className="eyebrow">{role}</p><h2>{player.player_name}</h2><p><span className="club-name-with-badge"><ClubBadgeLink teamId={player.team_id} teamName={player.team_name} href={teamExplorerHref(player.team_id)} />{player.team_name}</span> · {player.player_role}</p><span>{player.percentile_position} cohort · {formatNumber(player.regular_minutes, 1)} min</span></div></article>;
}

function comparisonMetric(profile: PlayerStatsDetailResponse, metric: string) {
  return profile.percentiles.find((item) => item.metric === metric) ?? null;
}

function comparisonValue(metric: PlayerPercentile | null) {
  if (!metric) return "—";
  if (metric.value_format === "percent") return formatPercent(metric.value);
  return formatNumber(metric.value, metric.metric.includes("margin") ? 4 : 2);
}

function comparisonDelta(anchor: PlayerPercentile | null, comparison: PlayerPercentile | null) {
  if (!anchor || !comparison || anchor.value === null || comparison.value === null) return "—";
  const delta = comparison.value - anchor.value;
  const formatted = anchor.value_format === "percent" ? formatPercent(Math.abs(delta)) : formatNumber(Math.abs(delta), anchor.metric.includes("margin") ? 4 : 2);
  return `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${formatted}`;
}

function ComparisonPercentile({ metric }: { metric: PlayerPercentile | null }) {
  if (!metric) return <span className="percentile-badge percentile-badge--unavailable">—</span>;
  return <span className={`percentile-badge ${percentileClass(metric)}`}>{percentileDisplay(metric)}</span>;
}

function ComparisonOverviewMetric({ metric, comparisonMetric: comparator }: { metric: PlayerPercentile | null; comparisonMetric: PlayerPercentile | null }) {
  return <article className="comparison-overview__metric"><MetricLabel label={metric?.label ?? comparator?.label ?? "Metric"} help={playerMetricHelp(metric?.metric ?? comparator?.metric)} /><div className="comparison-overview__values"><span><strong>{comparisonValue(metric)}</strong><ComparisonPercentile metric={metric} /></span><span><strong>{comparisonValue(comparator)}</strong><ComparisonPercentile metric={comparator} /></span></div><small>Δ {comparisonDelta(metric, comparator)}</small></article>;
}

function ComparisonGroup({ eyebrow, title, metrics, anchor, comparison }: { eyebrow: string; title: string; metrics: string[]; anchor: PlayerStatsDetailResponse; comparison: PlayerStatsDetailResponse }) {
  return <section className="panel comparison-group"><div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div><ComparisonTable anchor={anchor} comparison={comparison} metrics={metrics} compact /></section>;
}

function ComparisonTable({ anchor, comparison, metrics, compact = false }: { anchor: PlayerStatsDetailResponse; comparison: PlayerStatsDetailResponse; metrics: string[]; compact?: boolean }) {
  return <div className={compact ? "comparison-table-wrap comparison-table-wrap--compact" : "review-table-wrap"}><table className="data-table player-comparison-table"><thead><tr><th>Metric</th><th><span>{anchor.player_name}</span><small>Value · percentile</small></th><th><span>{comparison.player_name}</span><small>Value · percentile</small></th><th>Δ B − A</th></tr></thead><tbody>{metrics.map((code) => {
    const anchorMetric = comparisonMetric(anchor, code);
    const comparisonPlayerMetric = comparisonMetric(comparison, code);
    return <tr key={code} className={code === "pvi" ? "is-pvi" : undefined}><th scope="row"><MetricLabel label={anchorMetric?.label ?? comparisonPlayerMetric?.label ?? code} help={playerMetricHelp(code)} /></th><td><span>{comparisonValue(anchorMetric)}</span><ComparisonPercentile metric={anchorMetric} /><small>{anchorMetric ? `${anchorMetric.peer_count} peer${anchorMetric.peer_count === 1 ? "" : "s"}` : ""}</small></td><td><span>{comparisonValue(comparisonPlayerMetric)}</span><ComparisonPercentile metric={comparisonPlayerMetric} /><small>{comparisonPlayerMetric ? `${comparisonPlayerMetric.peer_count} peer${comparisonPlayerMetric.peer_count === 1 ? "" : "s"}` : ""}</small></td><td className="player-comparison-table__delta">{comparisonDelta(anchorMetric, comparisonPlayerMetric)}</td></tr>;
  })}</tbody></table></div>;
}

function ProfileMetric({ label, value, detail, percentile, position }: { label: string; value: string; detail?: string; percentile?: PlayerPercentile; position: string }) {
  const help = playerMetricHelp(percentile?.metric);
  return <div className="metric profile-metric"><div><span className="metric__label"><MetricLabel label={label} help={help} /></span><strong className="metric__value">{value}</strong>{detail ? <span className="metric__detail">{detail}</span> : null}</div>{percentile ? <PercentileGauge metric={percentile} position={position} help={help} /> : null}</div>;
}

function ProfileDefinition({ term, help, percentile, position, children }: { term: string; help?: string; percentile?: PlayerPercentile; position?: string; children: ReactNode }) {
  const resolvedHelp = help ?? playerMetricHelp(percentile?.metric) ?? "Observed Player Analysis total from the available local matches; use the adjacent per-90 rate or complete fixed baseline for positional comparison.";
  return <div className="definition definition--percentile"><dt><MetricLabel label={term} help={resolvedHelp} /></dt><dd><span className="definition__value">{children}</span>{percentile && position ? <PercentileGauge metric={percentile} position={position} help={resolvedHelp} /> : null}</dd></div>;
}

function percentileValue(metric: PlayerPercentile) {
  return metric.value_format === "percent" ? formatPercent(metric.value) : formatNumber(metric.value, 2);
}

function percentileDisplay(metric: PlayerPercentile) {
  if (metric.percentile !== null) return formatOrdinal(metric.percentile);
  return metric.peer_count < 5 ? "Insufficient sample" : "No observed value";
}

function AllPercentiles({ metrics }: { metrics: PlayerPercentile[] }) {
  return <div className="review-table-wrap"><table className="data-table percentile-table"><thead><tr><th>Metric</th><th>Raw value</th><th>Positional percentile</th><th>Direction</th><th>Eligible peers</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.metric}><th scope="row"><MetricLabel label={metric.label} help={playerMetricHelp(metric.metric)} /></th><td>{percentileValue(metric)}</td><td><span className={`percentile-badge ${percentileClass(metric)}`}>{percentileDisplay(metric)}</span></td><td>{metric.direction === "lower_is_better" ? "Lower is stronger" : "Higher is stronger"}</td><td>{metric.peer_count < 5 ? "Fewer than 5" : metric.peer_count}</td></tr>)}</tbody></table></div>;
}

function MatchBreakdown({ rows, matches }: { rows: PlayerMatchStats[]; matches: MatchOption[] }) {
  return <div className="review-table-wrap"><table className="data-table player-match-table"><thead><tr><th>Match</th><th>Role</th><PlayerTableHeader label="Minutes" help="Source regular-time minutes in this available local match." /><PlayerTableHeader label="Passes /90" metric="passes_per90" /><PlayerTableHeader label="Pass completion" metric="completion_rate" /><PlayerTableHeader label="Local xPass" metric="local_xpass" /><PlayerTableHeader label="PVI" metric="pvi" /><PlayerTableHeader label="Frame-best PVI" metric="pvi_best_rate" /><PlayerTableHeader label="Higher open-xT /90" metric="higher_open_xt_per90" /><PlayerTableHeader label="Targets /90" metric="targets_per90" /><PlayerTableHeader label="Target completion" metric="target_completion_rate" /></tr></thead><tbody>{rows.map((row) => <tr key={row.match_id}><th scope="row"><FixtureStrip match={matches.find((match) => match.id === row.match_id) ?? null} teamHref={teamExplorerHref} variant="inline" />{matches.some((match) => match.id === row.match_id) ? null : row.match_name}</th><td>{row.player_role}</td><td>{formatNumber(row.regular_minutes, 1)}</td><td>{formatNumber(row.passing.attempts_per90, 1)}</td><td>{formatPercent(row.passing.completion_rate)}</td><td>{formatNumber(row.passing.local_xpass, 3)}</td><td>{formatNumber(row.passing.pvi, 1)}</td><td>{formatPercent(row.passing.frame_best_pvi_selection_rate)}</td><td>{formatNumber(row.passing.higher_open_xt_alternatives_per90, 2)}</td><td>{formatNumber(row.receiving.targets_per90, 1)}</td><td>{formatPercent(row.receiving.target_completion_rate)}</td></tr>)}</tbody></table></div>;
}
