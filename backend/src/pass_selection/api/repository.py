from __future__ import annotations

import json
import math
from collections import OrderedDict
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import pandas as pd

from pass_selection.api.contracts import (
    AppliedReviewFilters,
    DataCounts,
    DecisionDetails,
    EntityOption,
    ExplorerMetrics,
    FilterOptions,
    FramePayload,
    LocalXPassMetrics,
    MatchOption,
    MetadataResponse,
    PasserOption,
    PasserOriginSide,
    PasserOriginThird,
    PasserScope,
    PassOutcome,
    PassViabilityMetrics,
    PlaybackBundle,
    PlaybackRenderContext,
    PlayerMatchStats,
    PlayerPassingStats,
    PlayerPercentile,
    PlayerPercentileMetric,
    PlayerReceivingStats,
    PlayerStatsDetailResponse,
    PlayerStatsDirectoryResponse,
    PlayerStatsFilters,
    PlayerStatSummary,
    ProviderPeakMetrics,
    ReceiverOption,
    ReviewClassification,
    ReviewListResponse,
    ReviewMetricBounds,
    ReviewMetricRange,
    ReviewNavigationResponse,
    ReviewSummary,
    SameFrameMetrics,
    TimelineMarker,
    TimelineResponse,
    TrackedObject,
)
from pass_selection.config import APP_DATA_DIR, SOURCE_MATCHES_DIR
from pass_selection.production import (
    PERCENTILE_METRICS,
    PERCENTILE_METRICS_BY_CODE,
    PLAYER_MATCH_STATS_FILENAME,
    PLAYER_STATS_FILENAME,
)

RENDERED_ARTIFACT_REVISION = "public-production-v1"
DEFAULT_TIMELINE_WINDOW = 30
MAX_TIMELINE_WINDOW = 180
REVIEW_SORT_COLUMNS = {
    "minute": ["match_id", "match_second", "actual_pass_frame", "decision_id"],
    "team": ["_team_sort_name", "match_id", "match_second", "decision_id"],
    "match": ["match_id", "match_second", "actual_pass_frame", "decision_id"],
    "margin": ["local_open_xt_margin", "decision_id"],
    "selected_rank": ["selected_open_xt_rank", "decision_id"],
    "local_xpass": ["selected_local_xpass", "decision_id"],
    "pass_viability": ["selected_pass_viability_score", "decision_id"],
    "pass_viability_rank": ["selected_pass_viability_rank", "decision_id"],
    "pass_viability_gap": ["pass_viability_gap", "decision_id"],
    "provider_choice": ["provider_peak_selected_option_choice_objective", "decision_id"],
    "provider_choice_rank": ["provider_peak_selected_option_choice_rank", "decision_id"],
    "passer": ["passer_name", "decision_id"],
    "classification": ["review_classification", "decision_id"],
}
PLAYER_STATS_SORTS = {
    "minutes",
    "passes_per90",
    "completion_rate",
    "local_xpass",
    "availability",
    "pvi",
    "pvi_best_rate",
    "higher_open_xt_per90",
    "targets_per90",
    "target_completion_rate",
    "percentile",
}


class DecisionNotFoundError(LookupError):
    """Raised when a decision id is absent from the immutable published table."""


class FrameNotFoundError(LookupError):
    """Raised when a requested source tracking frame is unavailable."""


class PlayerNotFoundError(LookupError):
    """Raised when an available-match player is absent from the requested scope."""


@dataclass(frozen=True)
class MatchContext:
    match_id: int
    home_team_id: int | None
    home_team_name: str
    away_team_id: int | None
    away_team_name: str
    score: str | None
    date_time: str | None
    pitch_length: float
    pitch_width: float
    player_names: dict[int, str]
    player_teams: dict[int, int]

    @property
    def label(self) -> str:
        return f"{self.home_team_name} vs {self.away_team_name}"

    def team_name(self, team_id: int | None) -> str:
        if team_id == self.home_team_id:
            return self.home_team_name
        if team_id == self.away_team_id:
            return self.away_team_name
        return f"Team {team_id}" if team_id is not None else "Unknown team"


@dataclass(frozen=True)
class TrackingIndex:
    path: Path
    offsets: dict[int, int]


def _is_missing(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float):
        return not math.isfinite(value)
    try:
        missing = pd.isna(value)
    except TypeError:
        return False
    if missing is pd.NA:
        return True
    try:
        return bool(missing)
    except (TypeError, ValueError):
        return False


def _optional_float(value: object) -> float | None:
    if _is_missing(value):
        return None
    try:
        candidate = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return candidate if math.isfinite(candidate) else None


def _optional_int(value: object) -> int | None:
    candidate = _optional_float(value)
    return None if candidate is None else int(candidate)


def _optional_bool(value: object) -> bool | None:
    if _is_missing(value):
        return None
    return bool(value)


def _text(value: object, fallback: str = "Unavailable") -> str:
    return fallback if _is_missing(value) else str(value)


def _surname_sort_key(value: object) -> str:
    parts = _text(value, "").strip().split()
    return parts[-1].casefold() if parts else ""


def _distance(first: TrackedObject | None, second: TrackedObject | None) -> float | None:
    if first is None or second is None:
        return None
    first_x, first_y, second_x, second_y = first.x, first.y, second.x, second.y
    if first_x is None or first_y is None or second_x is None or second_y is None:
        return None
    return math.dist((first_x, first_y), (second_x, second_y))


def _clock(value: object) -> str:
    seconds = _optional_float(value)
    if seconds is None:
        return "Unavailable"
    minute = int(seconds // 60)
    second = int(seconds % 60)
    return f"{minute:02d}:{second:02d}"


class WorkbenchRepository:
    """Read-only access to the immutable public application dataset."""

    def __init__(
        self,
        app_data_dir: Path = APP_DATA_DIR,
        source_matches_dir: Path = SOURCE_MATCHES_DIR,
    ) -> None:
        self.app_data_dir = app_data_dir
        self.source_matches_dir = source_matches_dir
        self.decisions = pd.read_parquet(app_data_dir / "pass_decisions.parquet")
        analyst_decision_ids = set(self.decisions.decision_id.astype(str))
        technical_options = pd.read_parquet(app_data_dir / "pass_options.parquet")
        self.options = technical_options.loc[
            technical_options.decision_id.astype(str).isin(analyst_decision_ids)
        ].copy()
        candidate_path = app_data_dir / "local_xpass_candidates.parquet"
        if not candidate_path.exists():
            raise RuntimeError(
                "The committed Local xPass candidate table is missing."
            )
        self.candidates = pd.read_parquet(candidate_path)
        self.candidates = self.candidates.loc[
            self.candidates.decision_id.astype(str).isin(analyst_decision_ids)
        ].copy()
        self.decisions = self._attach_local_summaries(self.decisions, self.candidates)
        self.review_candidates = pd.read_parquet(app_data_dir / "review_candidates.parquet")
        self.review_candidates = self.review_candidates.loc[
            self.review_candidates.decision_id.astype(str).isin(analyst_decision_ids)
        ].copy()
        player_stats_path = app_data_dir / PLAYER_MATCH_STATS_FILENAME
        if not player_stats_path.exists():
            raise RuntimeError(
                "The committed player-match statistics table is missing."
            )
        self.player_match_stats = pd.read_parquet(player_stats_path)
        player_summary_path = app_data_dir / PLAYER_STATS_FILENAME
        if not player_summary_path.exists():
            raise RuntimeError(
                "The committed player statistics table is missing."
            )
        self.player_stats = pd.read_parquet(player_summary_path)
        self._contexts = self._load_match_contexts()
        self.decisions["_team_sort_name"] = [
            self._context(int(row.match_id)).team_name(int(row.team_id)).casefold()
            for row in self.decisions.itertuples(index=False)
        ]
        self._decisions_by_id = {
            str(row.decision_id): row for row in self.decisions.itertuples(index=False)
        }
        self._options_by_decision = {
            str(decision_id): group.copy()
            for decision_id, group in self.options.groupby("decision_id", sort=False)
        }
        self._provider_by_option_id = {
            str(row.option_id): row for row in self.options.itertuples(index=False)
        }
        self._candidates_by_decision = {
            str(decision_id): group.copy()
            for decision_id, group in self.candidates.groupby("decision_id", sort=False)
        }
        self._tracking_indices: OrderedDict[int, TrackingIndex] = OrderedDict()
        self._tracking_index_limit = 4

    @staticmethod
    def _attach_local_summaries(
        decisions: pd.DataFrame, candidates: pd.DataFrame
    ) -> pd.DataFrame:
        """Join actual-frame local safety, PVI, and open-xT summaries onto decisions.

        This is presentation/query state only: the candidate artifact remains the
        source of truth and no score is recomputed in the API.
        """

        selected_columns = [
            "decision_id",
            "local_xpass",
            "availability_score",
            "pass_viability_score",
            "pass_viability_rank",
            "same_frame_receiver_xt_rank",
            "same_frame_receiver_xt",
            "same_frame_receiver_delta_xt",
        ]
        selected = candidates.loc[
            candidates.is_selected.eq(True), selected_columns  # noqa: E712
        ].rename(
            columns={
                "local_xpass": "selected_local_xpass",
                "availability_score": "selected_availability_score",
                "pass_viability_score": "selected_pass_viability_score",
                "pass_viability_rank": "selected_pass_viability_rank",
                "same_frame_receiver_xt_rank": "selected_open_xt_rank",
                "same_frame_receiver_xt": "selected_open_xt",
                "same_frame_receiver_delta_xt": "selected_open_xt_delta",
            }
        )
        selected = selected.drop_duplicates("decision_id", keep="first")

        eligible = candidates.loc[
            candidates.pass_viability_eligible.eq(True)
            & candidates.pass_viability_score.notna(),
            ["decision_id", "receiver_id", "receiver_name", "pass_viability_score"],
        ].sort_values(
            ["decision_id", "pass_viability_score", "receiver_id"],
            ascending=[True, False, True],
            kind="stable",
        )
        best = eligible.drop_duplicates("decision_id", keep="first").rename(
            columns={
                "receiver_id": "best_pass_viability_receiver_id",
                "receiver_name": "best_pass_viability_receiver_name",
                "pass_viability_score": "best_pass_viability_score",
            }
        )

        open_xt = candidates.loc[
            candidates.same_frame_receiver_delta_xt.notna(),
            [
                "decision_id", "receiver_id", "receiver_name", "same_frame_receiver_xt_rank",
                "same_frame_receiver_xt", "same_frame_receiver_delta_xt",
            ],
        ].sort_values(
            ["decision_id", "same_frame_receiver_xt_rank", "same_frame_receiver_delta_xt", "receiver_id"],
            ascending=[True, True, False, True], kind="stable",
        )
        highest_open_xt = open_xt.drop_duplicates("decision_id", keep="first").rename(
            columns={
                "receiver_id": "highest_open_xt_receiver_id",
                "receiver_name": "highest_open_xt_receiver_name",
                "same_frame_receiver_xt": "highest_open_xt",
                "same_frame_receiver_delta_xt": "highest_open_xt_delta",
            }
        ).drop(columns=["same_frame_receiver_xt_rank"])
        summary = selected.merge(best, on="decision_id", how="outer", validate="one_to_one")
        summary = summary.merge(highest_open_xt, on="decision_id", how="outer", validate="one_to_one")
        summary["pass_viability_gap"] = (
            summary.best_pass_viability_score - summary.selected_pass_viability_score
        )
        summary["local_open_xt_margin"] = (
            summary.highest_open_xt_delta - summary.selected_open_xt_delta
        )
        return decisions.merge(summary, on="decision_id", how="left", validate="one_to_one")

    def _match_directory(self, match_id: int) -> Path:
        return self.source_matches_dir / str(match_id)

    def _load_match_contexts(self) -> dict[int, MatchContext]:
        contexts: dict[int, MatchContext] = {}
        for match_id in sorted(int(value) for value in self.decisions.match_id.unique()):
            metadata_path = self._match_directory(match_id) / f"{match_id}_match.json"
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
            home = payload.get("home_team") or {}
            away = payload.get("away_team") or {}
            players = payload.get("players") or []
            player_names = {
                int(player["id"]): str(player.get("short_name") or player.get("last_name") or player["id"])
                for player in players
                if player.get("id") is not None
            }
            player_teams = {
                int(player["id"]): int(player["team_id"])
                for player in players
                if player.get("id") is not None and player.get("team_id") is not None
            }
            home_score = payload.get("home_team_score")
            away_score = payload.get("away_team_score")
            score = None if home_score is None or away_score is None else f"{home_score}–{away_score}"
            contexts[match_id] = MatchContext(
                match_id=match_id,
                home_team_id=_optional_int(home.get("id")),
                home_team_name=str(home.get("short_name") or home.get("name") or "Home"),
                away_team_id=_optional_int(away.get("id")),
                away_team_name=str(away.get("short_name") or away.get("name") or "Away"),
                score=score,
                date_time=payload.get("date_time"),
                pitch_length=float(payload.get("pitch_length") or 105.0),
                pitch_width=float(payload.get("pitch_width") or 68.0),
                player_names=player_names,
                player_teams=player_teams,
            )
        return contexts

    def _context(self, match_id: object) -> MatchContext:
        normalized = _optional_int(match_id)
        if normalized is None or normalized not in self._contexts:
            raise DecisionNotFoundError(f"Match context is unavailable for {match_id!r}.")
        return self._contexts[normalized]

    def _decision_series(self, decision_id: str) -> pd.Series:
        try:
            raw = self._decisions_by_id[decision_id]
        except KeyError as error:
            raise DecisionNotFoundError(f"Decision {decision_id!r} was not found.") from error
        return pd.Series(raw._asdict())

    def decision_series(self, decision_id: str) -> pd.Series:
        """Return a copy-like row view for rendering only; never mutate it."""

        return self._decision_series(decision_id)

    def options_for_decision(self, decision_id: str) -> pd.DataFrame:
        try:
            return self._options_by_decision[decision_id].copy()
        except KeyError as error:
            raise DecisionNotFoundError(f"Decision {decision_id!r} was not found.") from error

    def candidates_for_decision(self, decision_id: str) -> pd.DataFrame:
        """All tracked teammates at the pass frame, including non-provider candidates."""

        candidates = self._candidates_by_decision.get(decision_id)
        if candidates is not None:
            return candidates.copy()
        # Preserve a stable empty candidate schema if a published decision has
        # no local candidate rows.
        self._decision_series(decision_id)
        return self.candidates.iloc[0:0].copy()

    def _selected_option(self, decision_id: str) -> pd.Series | None:
        options = self.options_for_decision(decision_id)
        selected = options.loc[options.is_selected == True]  # noqa: E712
        return None if selected.empty else selected.iloc[0]

    def _option_for_player(self, decision_id: str, player_id: object) -> pd.Series | None:
        normalized = _optional_int(player_id)
        if normalized is None:
            return None
        options = self.options_for_decision(decision_id)
        matches = options.loc[options.receiver_id.eq(normalized)]
        return None if matches.empty else matches.iloc[0]

    def _candidate_for_player(self, decision_id: str, player_id: object) -> pd.Series | None:
        normalized = _optional_int(player_id)
        if normalized is None:
            return None
        candidates = self.candidates_for_decision(decision_id)
        matches = candidates.loc[candidates.receiver_id.eq(normalized)]
        return None if matches.empty else matches.iloc[0]

    def _review_classification(self, decision: pd.Series) -> ReviewClassification:
        classification = _text(decision.get("review_classification"), "insufficient_quality")
        valid = {
            "stable_candidate",
            "same_frame_only",
            "provider_peak_only",
            "methods_disagree",
            "approximately_equivalent",
            "selected_best",
            "insufficient_quality",
        }
        return cast(ReviewClassification, classification if classification in valid else "insufficient_quality")

    @staticmethod
    def _pass_outcome(decision: pd.Series) -> PassOutcome:
        outcome = _text(decision.source_pass_outcome, "unsuccessful")
        return cast(PassOutcome, outcome if outcome in {"successful", "unsuccessful", "offside"} else "unsuccessful")

    def _option_xt(self, option: pd.Series | None) -> float | None:
        return None if option is None else _optional_float(option.get("same_frame_receiver_xt"))

    def _option_delta_xt(self, option: pd.Series | None) -> float | None:
        return None if option is None else _optional_float(option.get("same_frame_receiver_delta_xt"))

    @staticmethod
    def _passer_origin_third(decision: pd.Series) -> PasserOriginThird | None:
        value = _optional_text(decision.passer_origin_third)
        return cast(PasserOriginThird, value) if value in {"defensive", "middle", "attacking"} else None

    @staticmethod
    def _passer_origin_side(decision: pd.Series) -> PasserOriginSide | None:
        value = _optional_text(decision.passer_origin_side)
        return cast(PasserOriginSide, value) if value in {"left", "center", "right"} else None

    def review_summary(self, decision_id: str) -> ReviewSummary:
        decision = self._decision_series(decision_id)
        context = self._context(decision.match_id)
        selected = self._candidate_for_player(decision_id, decision.selected_receiver_id)
        best = self._candidate_for_player(
            decision_id, decision.same_frame_best_option_player_id
        )
        return ReviewSummary(
            decision_id=decision_id,
            match_id=int(decision.match_id),
            match_name=context.label,
            period=int(decision.period),
            frame=int(decision.actual_pass_frame),
            match_clock=_clock(decision.match_second),
            team_id=int(decision.team_id),
            team_name=context.team_name(int(decision.team_id)),
            passer_id=int(decision.passer_id),
            passer_name=_text(decision.passer_name),
            passer_origin_third=self._passer_origin_third(decision),
            passer_origin_side=self._passer_origin_side(decision),
            selected_receiver_id=int(decision.selected_receiver_id),
            selected_receiver_name=_text(decision.selected_receiver_name),
            selected_open_xt_rank=_optional_int(decision.selected_open_xt_rank),
            selected_open_xt=_optional_float(decision.selected_open_xt),
            selected_open_xt_delta=_optional_float(decision.selected_open_xt_delta),
            highest_open_xt_receiver_id=_optional_int(decision.highest_open_xt_receiver_id),
            highest_open_xt_receiver_name=_optional_text(decision.highest_open_xt_receiver_name),
            highest_open_xt=_optional_float(decision.highest_open_xt),
            highest_open_xt_delta=_optional_float(decision.highest_open_xt_delta),
            local_open_xt_margin=_optional_float(decision.local_open_xt_margin),
            best_same_frame_receiver_id=_optional_int(decision.same_frame_best_option_player_id),
            best_same_frame_receiver_name=(
                None if best is None else _text(best.receiver_name, "Unavailable")
            ),
            selected_rank=_optional_int(decision.same_frame_selected_option_rank),
            selected_same_frame_xt=self._option_xt(selected),
            selected_same_frame_delta_xt=self._option_delta_xt(selected),
            best_same_frame_xt=self._option_xt(best),
            best_same_frame_delta_xt=self._option_delta_xt(best),
            same_frame_margin=_optional_float(decision.same_frame_xt_margin),
            selected_local_xpass=_optional_float(decision.selected_local_xpass),
            selected_availability_score=_optional_float(decision.selected_availability_score),
            selected_pass_viability_score=_optional_float(decision.selected_pass_viability_score),
            selected_pass_viability_rank=_optional_int(decision.selected_pass_viability_rank),
            best_pass_viability_receiver_id=_optional_int(
                decision.best_pass_viability_receiver_id
            ),
            best_pass_viability_receiver_name=_optional_text(
                decision.best_pass_viability_receiver_name
            ),
            best_pass_viability_score=_optional_float(decision.best_pass_viability_score),
            pass_viability_gap=_optional_float(decision.pass_viability_gap),
            selected_provider_choice_objective=_optional_float(
                decision.provider_peak_selected_option_choice_objective
            ),
            selected_provider_composite_score=_optional_float(
                decision.provider_peak_selected_option_composite_score
            ),
            selected_provider_choice_rank=_optional_int(
                decision.provider_peak_selected_option_choice_rank
            ),
            provider_choice_margin=_optional_float(
                decision.provider_peak_selection_objective_margin
            ),
            provider_composite_score_margin=_optional_float(
                decision.provider_peak_composite_score_margin
            ),
            review_classification=self._review_classification(decision),
            is_review_candidate=bool(decision.same_frame_review_candidate),
            provider_agreement=_optional_bool(decision.same_frame_and_provider_best_agree),
            pass_outcome=self._pass_outcome(decision),
        )

    def _filtered_decisions(self, filters: AppliedReviewFilters) -> pd.DataFrame:
        frame = self.decisions.copy()
        if filters.match_id is not None:
            frame = frame.loc[frame.match_id.eq(filters.match_id)]
        if filters.team_id is not None:
            frame = frame.loc[frame.team_id.eq(filters.team_id)]
        if filters.passer_id is not None:
            frame = frame.loc[frame.passer_id.eq(filters.passer_id)]
        if filters.passer_origin_third is not None:
            frame = frame.loc[frame.passer_origin_third.eq(filters.passer_origin_third)]
        if filters.passer_origin_side is not None:
            frame = frame.loc[frame.passer_origin_side.eq(filters.passer_origin_side)]
        if filters.review_classification is not None:
            frame = frame.loc[frame.review_classification.eq(filters.review_classification)]
        if filters.review_candidate is not None:
            frame = frame.loc[frame.same_frame_review_candidate.eq(filters.review_candidate)]
        if filters.pass_outcome is not None:
            frame = frame.loc[frame.source_pass_outcome.eq(filters.pass_outcome)]
        if filters.selected_rank is not None:
            frame = frame.loc[frame.selected_open_xt_rank.eq(filters.selected_rank)]
        if filters.min_selected_rank is not None:
            frame = frame.loc[frame.selected_open_xt_rank.ge(filters.min_selected_rank)]
        if filters.max_selected_rank is not None:
            frame = frame.loc[frame.selected_open_xt_rank.le(filters.max_selected_rank)]
        if filters.min_same_frame_margin is not None:
            frame = frame.loc[frame.local_open_xt_margin.ge(filters.min_same_frame_margin)]
        if filters.max_same_frame_margin is not None:
            frame = frame.loc[frame.local_open_xt_margin.le(filters.max_same_frame_margin)]
        if filters.min_selected_pass_viability_score is not None:
            frame = frame.loc[
                frame.selected_pass_viability_score.ge(filters.min_selected_pass_viability_score)
            ]
        if filters.max_selected_pass_viability_score is not None:
            frame = frame.loc[
                frame.selected_pass_viability_score.le(filters.max_selected_pass_viability_score)
            ]
        if filters.min_pass_viability_gap is not None:
            frame = frame.loc[frame.pass_viability_gap.ge(filters.min_pass_viability_gap)]
        if filters.max_pass_viability_gap is not None:
            frame = frame.loc[frame.pass_viability_gap.le(filters.max_pass_viability_gap)]
        if filters.selected_pvi_not_best is not None:
            is_not_best = frame.selected_pass_viability_rank.gt(1)
            is_frame_best = frame.selected_pass_viability_rank.eq(1)
            frame = frame.loc[is_not_best if filters.selected_pvi_not_best else is_frame_best]
        if filters.provider_agreement is not None:
            frame = frame.loc[frame.same_frame_and_provider_best_agree.eq(filters.provider_agreement)]
        if filters.search:
            query = filters.search.casefold().strip()
            searchable = (
                frame.decision_id.astype(str)
                + " "
                + frame.passer_name.fillna("").astype(str)
                + " "
                + frame.selected_receiver_name.fillna("").astype(str)
            ).str.casefold()
            frame = frame.loc[searchable.str.contains(query, regex=False, na=False)]
        return frame

    @staticmethod
    def _explorer_metrics(frame: pd.DataFrame) -> ExplorerMetrics:
        margins = frame.local_open_xt_margin.dropna()
        selected_pvi = frame.selected_pass_viability_score.dropna()
        pvi_gap = frame.pass_viability_gap.dropna()
        selected_local_xpass = frame.selected_local_xpass.dropna()
        selected_availability = frame.selected_availability_score.dropna()
        selected_provider_choice = frame.provider_peak_selected_option_choice_objective.dropna()
        selected_provider_composite_score = (
            frame.provider_peak_selected_option_composite_score.dropna()
        )
        passer_origin_coverage = frame.passer_origin_third.notna() & frame.passer_origin_side.notna()
        return ExplorerMetrics(
            decision_count=int(len(frame)),
            review_candidate_count=int(frame.same_frame_review_candidate.sum()),
            classification_distribution={
                str(name): int(count)
                for name, count in frame.review_classification.value_counts(dropna=False).sort_index().items()
            },
            median_same_frame_margin=(None if margins.empty else float(margins.median())),
            p95_same_frame_margin=(None if margins.empty else float(margins.quantile(0.95))),
            selected_pvi_eligible_count=int(selected_pvi.count()),
            median_selected_pass_viability_score=(
                None if selected_pvi.empty else float(selected_pvi.median())
            ),
            median_pass_viability_gap=(None if pvi_gap.empty else float(pvi_gap.median())),
            selected_not_frame_best_pvi_count=int(frame.selected_pass_viability_rank.gt(1).sum()),
            median_selected_local_xpass=(
                None if selected_local_xpass.empty else float(selected_local_xpass.median())
            ),
            median_selected_availability_score=(
                None if selected_availability.empty else float(selected_availability.median())
            ),
            selected_provider_choice_coverage=int(selected_provider_choice.count()),
            median_selected_provider_choice_objective=(
                None
                if selected_provider_choice.empty
                else float(selected_provider_choice.median())
            ),
            median_selected_provider_composite_score=(
                None
                if selected_provider_composite_score.empty
                else float(selected_provider_composite_score.median())
            ),
            selected_not_provider_best_count=int(
                frame.provider_peak_selected_option_choice_rank.gt(1).sum()
            ),
            unique_matches=int(frame.match_id.nunique()),
            unique_passers=int(frame.passer_id.nunique()),
            passer_origin_coverage=int(passer_origin_coverage.sum()),
            passer_origin_third_distribution={
                name: int(frame.passer_origin_third.eq(name).sum())
                for name in ("defensive", "middle", "attacking")
            },
            passer_origin_side_distribution={
                name: int(frame.passer_origin_side.eq(name).sum())
                for name in ("left", "center", "right")
            },
        )

    def list_reviews(
        self,
        filters: AppliedReviewFilters,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> ReviewListResponse:
        filtered = self._filtered_decisions(filters)
        ordered = filtered.sort_values(
            REVIEW_SORT_COLUMNS[sort_by],
            ascending=sort_direction == "asc",
            kind="stable",
            na_position="last",
        )
        total = int(len(ordered))
        start = (page - 1) * page_size
        page_rows = ordered.iloc[start : start + page_size]
        return ReviewListResponse(
            items=[self.review_summary(str(row.decision_id)) for row in page_rows.itertuples(index=False)],
            total=total,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction="asc" if sort_direction == "asc" else "desc",
            metrics=self._explorer_metrics(filtered),
            applied_filters=filters,
        )

    def review_navigation(
        self,
        filters: AppliedReviewFilters,
        sort_by: str = "minute",
        sort_direction: str = "asc",
    ) -> ReviewNavigationResponse:
        """Return compact navigation state without hydrating thousands of review cards."""

        ordered = self._filtered_decisions(filters).sort_values(
            REVIEW_SORT_COLUMNS[sort_by],
            ascending=sort_direction == "asc",
            kind="stable",
            na_position="last",
        )
        return ReviewNavigationResponse(
            decision_ids=[str(value) for value in ordered.decision_id.tolist()],
            total=int(len(ordered)),
        )

    def counts(self) -> DataCounts:
        return DataCounts(
            decisions=int(len(self.decisions)),
            options=int(len(self.options)),
            review_candidates=int(len(self.review_candidates)),
        )

    def match_options(self, team_id: int | None = None) -> list[MatchOption]:
        contexts = sorted(self._contexts.values(), key=lambda item: item.match_id)
        if team_id is not None:
            contexts = [
                context
                for context in contexts
                if team_id in {context.home_team_id, context.away_team_id}
            ]
        return [
            MatchOption(
                id=context.match_id,
                label=context.label,
                home_team_id=context.home_team_id,
                home_team_name=context.home_team_name,
                away_team_id=context.away_team_id,
                away_team_name=context.away_team_name,
                score=context.score,
                date_time=context.date_time,
            )
            for context in contexts
        ]

    def team_options(self, match_id: int | None = None) -> list[EntityOption]:
        teams: dict[int, str] = {}
        contexts: Iterable[MatchContext] = self._contexts.values()
        if match_id is not None:
            context = self._contexts.get(match_id)
            contexts = [] if context is None else [context]
        for context in contexts:
            if context.home_team_id is not None:
                teams[context.home_team_id] = context.home_team_name
            if context.away_team_id is not None:
                teams[context.away_team_id] = context.away_team_name
        return [EntityOption(id=team_id, label=name) for team_id, name in sorted(teams.items())]

    def passer_options(
        self,
        match_id: int | None = None,
        team_id: int | None = None,
    ) -> list[PasserOption]:
        passers = self.decisions[["passer_id", "passer_name", "match_id", "team_id"]].dropna(
            subset=["passer_id", "match_id", "team_id"]
        )
        if match_id is not None:
            passers = passers.loc[passers.match_id.eq(match_id)]
        if team_id is not None:
            passers = passers.loc[passers.team_id.eq(team_id)]
        scoped = passers.drop_duplicates(["passer_id", "match_id", "team_id"]).sort_values(
            ["match_id", "team_id", "passer_id"], kind="stable"
        )
        options: list[PasserOption] = []
        for (_, _), group in scoped.groupby(["passer_id", "passer_name"], sort=False, dropna=False):
            first = group.iloc[0]
            options.append(
                PasserOption(
                    id=int(first.passer_id),
                    label=_text(first.passer_name),
                    scopes=[
                        PasserScope(match_id=int(row.match_id), team_id=int(row.team_id))
                        for row in group.itertuples(index=False)
                    ],
                )
            )
        return sorted(options, key=lambda option: (_surname_sort_key(option.label), option.label.casefold(), option.id))

    @staticmethod
    def _review_metric_range(values: pd.Series, step: float) -> ReviewMetricRange:
        clean = values.dropna()
        if clean.empty:
            raise ValueError("Published review metric bounds require at least one value.")
        return ReviewMetricRange(
            minimum=float(clean.min()),
            maximum=float(clean.max()),
            step=step,
        )

    def filter_options(self) -> FilterOptions:
        return FilterOptions(
            matches=self.match_options(),
            teams=self.team_options(),
            players=self.passer_options(),
            review_classifications=sorted(
                str(value) for value in self.decisions.review_classification.dropna().unique()
            ),
            pass_outcomes=sorted(str(value) for value in self.decisions.source_pass_outcome.dropna().unique()),
            review_metric_bounds=ReviewMetricBounds(
                selected_rank=self._review_metric_range(self.decisions.selected_open_xt_rank, 1.0),
                same_frame_margin=ReviewMetricRange(minimum=0.0, maximum=0.25, step=0.001),
                selected_pass_viability_score=ReviewMetricRange(minimum=25.0, maximum=100.0, step=0.1),
                pass_viability_gap=ReviewMetricRange(minimum=0.0, maximum=50.0, step=0.1),
            ),
        )

    def metadata(self) -> MetadataResponse:
        return MetadataResponse(
            application="Pass Selection Analytics",
            data_source="Committed analytical tables and source tracking frames",
            analytical_artifact_revision=RENDERED_ARTIFACT_REVISION,
            counts=self.counts(),
            filter_options=self.filter_options(),
        )

    @staticmethod
    def _ratio(numerator: float | int, denominator: float | int) -> float | None:
        return None if denominator <= 0 else float(numerator) / float(denominator)

    @staticmethod
    def _per90(value: float | int, minutes: float) -> float | None:
        return None if minutes <= 0 else 90.0 * float(value) / minutes

    @staticmethod
    def _mean(total: float | int, count: int) -> float | None:
        return None if count <= 0 else float(total) / count

    def _player_stats_scope(
        self,
        match_id: int | None,
        team_id: int | None,
        search: str | None,
        position: str | None = None,
    ) -> pd.DataFrame:
        if match_id is not None and match_id not in self._contexts:
            raise ValueError(f"match_id {match_id} is not present in the available-match sample")
        if team_id is not None and not any(
            team_id in {context.home_team_id, context.away_team_id}
            for context in self._contexts.values()
        ):
            raise ValueError(f"team_id {team_id} is not present in the available-match sample")
        if match_id is not None and team_id is not None:
            context = self._contexts[match_id]
            if team_id not in {context.home_team_id, context.away_team_id}:
                raise ValueError("team_id is not present in match_id")
        frame = self.player_stats
        if match_id is not None:
            members = self.player_match_stats.loc[
                self.player_match_stats.match_id.eq(match_id), ["player_id", "team_id"]
            ].drop_duplicates()
            frame = frame.merge(members, on=["player_id", "team_id"], how="inner")
        if team_id is not None:
            frame = frame.loc[frame.team_id.eq(team_id)]
        if search:
            needle = search.casefold().strip()
            if needle:
                frame = frame.loc[frame.player_name.astype(str).str.casefold().str.contains(needle)]
        if position:
            frame = frame.loc[frame.percentile_position.eq(position)]
        return frame.copy()

    def _player_role(self, group: pd.DataFrame) -> str:
        roles = (
            group.groupby("player_role", as_index=False)["regular_minutes"]
            .sum()
            .sort_values(["regular_minutes", "player_role"], ascending=[False, True], kind="stable")
        )
        return str(roles.iloc[0].player_role) if len(roles) == 1 else "Multiple roles"

    def _passing_stats(self, group: pd.DataFrame, minutes: float) -> PlayerPassingStats:
        attempts = int(group.passing_attempts.sum())
        successful = int(group.passing_successful.sum())
        unsuccessful = int(group.passing_unsuccessful.sum())
        offside = int(group.passing_offside.sum())
        resolved = successful + unsuccessful
        local_count = int(group.passing_local_xpass_count.sum())
        availability_count = int(group.passing_availability_count.sum())
        pvi_count = int(group.passing_pvi_count.sum())
        pvi_eligible = int(group.passing_pvi_eligible_count.sum())
        execution_count = int(group.passing_execution_expected_count.sum())
        attacking_eligible = int(group.passing_attacking_eligible_count.sum())
        attacking_missed = int(group.passing_attacking_missed_count.sum())
        expected_total = float(group.passing_execution_expected_sum.sum()) if execution_count else None
        completion_above_expected = (
            None
            if expected_total is None
            else float(group.passing_execution_successful.sum()) - expected_total
        )
        return PlayerPassingStats(
            attempts=attempts,
            successful=successful,
            unsuccessful=unsuccessful,
            offside=offside,
            resolved_attempts=resolved,
            attempts_per90=self._per90(attempts, minutes),
            completions_per90=self._per90(successful, minutes),
            completion_rate=self._ratio(successful, resolved),
            local_xpass=self._mean(group.passing_local_xpass_sum.sum(), local_count),
            local_xpass_coverage=local_count,
            availability=self._mean(group.passing_availability_sum.sum(), availability_count),
            availability_coverage=availability_count,
            mean_local_xpass_rank=self._mean(
                group.passing_local_xpass_rank_sum.sum(),
                int(group.passing_local_xpass_rank_count.sum()),
            ),
            pvi=self._mean(group.passing_pvi_sum.sum(), pvi_count),
            pvi_coverage=pvi_count,
            frame_best_pvi_selection_rate=self._ratio(
                group.passing_pvi_best_count.sum(), pvi_eligible
            ),
            mean_pvi_gap=self._mean(group.passing_pvi_gap_sum.sum(), int(group.passing_pvi_gap_count.sum())),
            execution_eligible_count=execution_count,
            expected_completions=expected_total,
            expected_completions_per90=(
                None if expected_total is None else self._per90(expected_total, minutes)
            ),
            completion_above_expected=completion_above_expected,
            completion_above_expected_per90=(
                None
                if completion_above_expected is None
                else self._per90(completion_above_expected, minutes)
            ),
            attacking_eligible_count=attacking_eligible,
            higher_open_xt_alternative_count=attacking_missed,
            higher_open_xt_alternative_rate=self._ratio(attacking_missed, attacking_eligible),
            higher_open_xt_alternatives_per90=self._per90(attacking_missed, minutes),
            mean_higher_open_xt_margin=self._mean(
                group.passing_attacking_margin_sum.sum(),
                int(group.passing_attacking_margin_count.sum()),
            ),
        )

    def _receiving_stats(self, group: pd.DataFrame, minutes: float) -> PlayerReceivingStats:
        targets = int(group.receiving_attempts.sum())
        successful = int(group.receiving_successful.sum())
        unsuccessful = int(group.receiving_unsuccessful.sum())
        offside = int(group.receiving_offside.sum())
        resolved = successful + unsuccessful
        local_count = int(group.receiving_local_xpass_count.sum())
        availability_count = int(group.receiving_availability_count.sum())
        pvi_count = int(group.receiving_pvi_count.sum())
        return PlayerReceivingStats(
            targets=targets,
            successful=successful,
            unsuccessful=unsuccessful,
            offside=offside,
            resolved_targets=resolved,
            targets_per90=self._per90(targets, minutes),
            successful_receptions_per90=self._per90(successful, minutes),
            target_completion_rate=self._ratio(successful, resolved),
            local_xpass=self._mean(group.receiving_local_xpass_sum.sum(), local_count),
            local_xpass_coverage=local_count,
            availability=self._mean(group.receiving_availability_sum.sum(), availability_count),
            availability_coverage=availability_count,
            pvi=self._mean(group.receiving_pvi_sum.sum(), pvi_count),
            pvi_coverage=pvi_count,
        )

    def _player_summary(self, group: pd.DataFrame) -> PlayerStatSummary:
        first = group.iloc[0]
        minutes = float(group.regular_minutes.sum())
        team_id = int(first.team_id)
        return PlayerStatSummary(
            player_id=int(first.player_id),
            player_name=_text(first.player_name),
            team_id=team_id,
            team_name=self._context(first.match_id).team_name(team_id),
            player_role=self._player_role(group),
            percentile_position=self._player_role(group),
            appearances=int(group.match_id.nunique()),
            regular_minutes=minutes,
            low_minutes_sample=minutes < 60.0,
            passing=self._passing_stats(group, minutes),
            receiving=self._receiving_stats(group, minutes),
        )

    @staticmethod
    def _static_passing_stats(row: pd.Series) -> PlayerPassingStats:
        return PlayerPassingStats(
            attempts=int(row.passing_attempts),
            successful=int(row.passing_successful),
            unsuccessful=int(row.passing_unsuccessful),
            offside=int(row.passing_offside),
            resolved_attempts=int(row.passing_resolved_attempts),
            attempts_per90=_optional_float(row.passing_attempts_per90),
            completions_per90=_optional_float(row.passing_completions_per90),
            completion_rate=_optional_float(row.passing_completion_rate),
            local_xpass=_optional_float(row.passing_local_xpass),
            local_xpass_coverage=int(row.passing_local_xpass_coverage),
            availability=_optional_float(row.passing_availability),
            availability_coverage=int(row.passing_availability_coverage),
            mean_local_xpass_rank=_optional_float(row.passing_mean_local_xpass_rank),
            pvi=_optional_float(row.passing_pvi),
            pvi_coverage=int(row.passing_pvi_coverage),
            frame_best_pvi_selection_rate=_optional_float(
                row.passing_frame_best_pvi_selection_rate
            ),
            mean_pvi_gap=_optional_float(row.passing_mean_pvi_gap),
            execution_eligible_count=int(row.passing_execution_eligible_count),
            expected_completions=_optional_float(row.passing_expected_completions),
            expected_completions_per90=_optional_float(row.passing_expected_completions_per90),
            completion_above_expected=_optional_float(row.passing_completion_above_expected),
            completion_above_expected_per90=_optional_float(
                row.passing_completion_above_expected_per90
            ),
            attacking_eligible_count=int(row.passing_attacking_eligible_count),
            higher_open_xt_alternative_count=int(row.passing_higher_open_xt_alternative_count),
            higher_open_xt_alternative_rate=_optional_float(row.passing_higher_open_xt_alternative_rate),
            higher_open_xt_alternatives_per90=_optional_float(
                row.passing_higher_open_xt_alternatives_per90
            ),
            mean_higher_open_xt_margin=_optional_float(row.passing_mean_higher_open_xt_margin),
        )

    @staticmethod
    def _static_receiving_stats(row: pd.Series) -> PlayerReceivingStats:
        return PlayerReceivingStats(
            targets=int(row.receiving_targets),
            successful=int(row.receiving_successful),
            unsuccessful=int(row.receiving_unsuccessful),
            offside=int(row.receiving_offside),
            resolved_targets=int(row.receiving_resolved_targets),
            targets_per90=_optional_float(row.receiving_targets_per90),
            successful_receptions_per90=_optional_float(row.receiving_successful_receptions_per90),
            target_completion_rate=_optional_float(row.receiving_target_completion_rate),
            local_xpass=_optional_float(row.receiving_local_xpass),
            local_xpass_coverage=int(row.receiving_local_xpass_coverage),
            availability=_optional_float(row.receiving_availability),
            availability_coverage=int(row.receiving_availability_coverage),
            pvi=_optional_float(row.receiving_pvi),
            pvi_coverage=int(row.receiving_pvi_coverage),
        )

    def _static_percentile(self, row: pd.Series, metric_code: str) -> PlayerPercentile:
        metric = PERCENTILE_METRICS_BY_CODE[metric_code]
        return PlayerPercentile(
            metric=metric.code,
            label=metric.label,
            value=_optional_float(row[metric.column]),
            percentile=_optional_float(row[f"percentile_{metric.code}"]),
            peer_count=int(row[f"percentile_{metric.code}_peer_count"]),
            direction=cast(Any, metric.direction),
            value_format=cast(Any, metric.value_format),
            headline=metric.headline,
        )

    def _static_team_name(self, row: pd.Series) -> str:
        matches = self.player_match_stats.loc[
            self.player_match_stats.player_id.eq(int(row.player_id))
            & self.player_match_stats.team_id.eq(int(row.team_id)),
            "match_id",
        ]
        return self._context(int(matches.iloc[0])).team_name(int(row.team_id))

    def _static_summary(
        self, row: pd.Series, percentile_metric: str = "pvi", include_percentile: bool = True
    ) -> PlayerStatSummary:
        return PlayerStatSummary(
            player_id=int(row.player_id),
            player_name=_text(row.player_name),
            team_id=int(row.team_id),
            team_name=self._static_team_name(row),
            player_role=_text(row.player_role),
            percentile_position=_text(row.percentile_position),
            appearances=int(row.appearances),
            regular_minutes=float(row.regular_minutes),
            low_minutes_sample=bool(row.low_minutes_sample),
            passing=self._static_passing_stats(row),
            receiving=self._static_receiving_stats(row),
            selected_percentile=(
                self._static_percentile(row, percentile_metric) if include_percentile else None
            ),
        )

    @staticmethod
    def _static_sort_value(row: pd.Series, sort_by: str, percentile_metric: str) -> float | None:
        columns = {
            "minutes": "regular_minutes",
            "passes_per90": "passing_attempts_per90",
            "completion_rate": "passing_completion_rate",
            "local_xpass": "passing_local_xpass",
            "availability": "passing_availability",
            "pvi": "passing_pvi",
            "pvi_best_rate": "passing_frame_best_pvi_selection_rate",
            "higher_open_xt_per90": "passing_higher_open_xt_alternatives_per90",
            "targets_per90": "receiving_targets_per90",
            "target_completion_rate": "receiving_target_completion_rate",
            "percentile": f"percentile_{percentile_metric}",
        }
        return _optional_float(row[columns[sort_by]])

    @staticmethod
    def _player_sort_value(item: PlayerStatSummary, sort_by: str) -> float | None:
        values = {
            "minutes": item.regular_minutes,
            "passes_per90": item.passing.attempts_per90,
            "completion_rate": item.passing.completion_rate,
            "local_xpass": item.passing.local_xpass,
            "availability": item.passing.availability,
            "pvi": item.passing.pvi,
            "pvi_best_rate": item.passing.frame_best_pvi_selection_rate,
            "higher_open_xt_per90": item.passing.higher_open_xt_alternatives_per90,
            "targets_per90": item.receiving.targets_per90,
            "target_completion_rate": item.receiving.target_completion_rate,
        }
        value = values[sort_by]
        return None if value is None else float(value)

    def list_player_stats(
        self,
        *,
        match_id: int | None,
        team_id: int | None,
        search: str | None,
        hide_under_60: bool,
        position: str | None,
        percentile_metric: str,
        min_percentile: float | None,
        max_percentile: float | None,
        sort_by: str,
        sort_direction: str,
    ) -> PlayerStatsDirectoryResponse:
        if percentile_metric not in PERCENTILE_METRICS_BY_CODE:
            raise ValueError(f"Unknown player percentile metric: {percentile_metric}")
        if min_percentile is not None and max_percentile is not None and min_percentile > max_percentile:
            raise ValueError("min_percentile cannot exceed max_percentile")
        frame = self._player_stats_scope(match_id, team_id, search, position)
        percentile_column = f"percentile_{percentile_metric}"
        if hide_under_60:
            frame = frame.loc[~frame.low_minutes_sample]
        if min_percentile is not None:
            frame = frame.loc[frame[percentile_column].ge(min_percentile)]
        if max_percentile is not None:
            frame = frame.loc[frame[percentile_column].le(max_percentile)]
        direction = 1.0 if sort_direction == "asc" else -1.0
        rows = sorted(
            (row for _, row in frame.iterrows()),
            key=lambda row: (
                self._static_sort_value(row, sort_by, percentile_metric) is None,
                direction * (self._static_sort_value(row, sort_by, percentile_metric) or 0.0),
                str(row.player_name).casefold(),
            ),
        )
        return PlayerStatsDirectoryResponse(
            items=[self._static_summary(row, percentile_metric) for row in rows],
            total=len(rows),
            sort_by=sort_by,
            sort_direction="asc" if sort_direction == "asc" else "desc",
            applied_filters=PlayerStatsFilters(
                match_id=match_id,
                team_id=team_id,
                search=search,
                hide_under_60=hide_under_60,
                position=position,
                percentile_metric=percentile_metric,
                min_percentile=min_percentile,
                max_percentile=max_percentile,
            ),
            positions=sorted(str(value) for value in self.player_stats.percentile_position.unique()),
            percentile_metrics=[
                PlayerPercentileMetric(
                    metric=metric.code,
                    label=metric.label,
                    direction=cast(Any, metric.direction),
                    value_format=cast(Any, metric.value_format),
                    headline=metric.headline,
                )
                for metric in PERCENTILE_METRICS
            ],
        )

    def player_stats_detail(
        self, player_id: int, match_id: int | None, team_id: int | None
    ) -> PlayerStatsDetailResponse:
        visible = self._player_stats_scope(match_id, team_id, None)
        player_rows = visible.loc[visible.player_id.eq(player_id)]
        if player_rows.empty:
            raise PlayerNotFoundError(
                f"Player {player_id} has no recorded available-match minutes in this scope."
            )
        static_row = player_rows.iloc[0]
        summary = self._static_summary(static_row)
        breakdown_rows = self.player_match_stats.loc[
            self.player_match_stats.player_id.eq(player_id)
            & self.player_match_stats.team_id.eq(int(static_row.team_id))
        ]
        if match_id is not None:
            breakdown_rows = breakdown_rows.loc[breakdown_rows.match_id.eq(match_id)]
        if team_id is not None:
            breakdown_rows = breakdown_rows.loc[breakdown_rows.team_id.eq(team_id)]
        breakdown = []
        for _, row in breakdown_rows.sort_values("match_id").iterrows():
            match_summary = self._static_summary(row, include_percentile=False)
            breakdown.append(
                PlayerMatchStats(
                    **match_summary.model_dump(),
                    match_id=int(row.match_id),
                    match_name=self._context(int(row.match_id)).label,
                )
            )
        return PlayerStatsDetailResponse(
            **summary.model_dump(),
            match_breakdown=breakdown,
            percentiles=[
                self._static_percentile(static_row, metric.code) for metric in PERCENTILE_METRICS
            ],
        )

    def _tracking_path(self, match_id: int) -> Path:
        return self._match_directory(match_id) / f"{match_id}_tracking_extrapolated.jsonl"

    def _tracking_index(self, match_id: int) -> TrackingIndex:
        cached = self._tracking_indices.get(match_id)
        if cached is not None:
            self._tracking_indices.move_to_end(match_id)
            return cached
        path = self._tracking_path(match_id)
        if not path.is_file():
            raise FrameNotFoundError(f"Tracking source is unavailable for match {match_id}.")
        offsets: dict[int, int] = {}
        with path.open("rb") as source:
            while True:
                offset = source.tell()
                line = source.readline()
                if not line:
                    break
                payload = json.loads(line)
                frame = _optional_int(payload.get("frame"))
                if frame is not None:
                    offsets[frame] = offset
        index = TrackingIndex(path=path, offsets=offsets)
        self._tracking_indices[match_id] = index
        self._tracking_indices.move_to_end(match_id)
        while len(self._tracking_indices) > self._tracking_index_limit:
            self._tracking_indices.popitem(last=False)
        return index

    def _raw_frame(self, match_id: int, frame_number: int) -> dict[str, Any]:
        index = self._tracking_index(match_id)
        offset = index.offsets.get(frame_number)
        if offset is None:
            raise FrameNotFoundError(f"Frame {frame_number} is unavailable for match {match_id}.")
        with index.path.open("rb") as source:
            source.seek(offset)
            return json.loads(source.readline())

    def _tracked_player(
        self,
        raw: dict[str, Any] | None,
        context: MatchContext,
        decision: pd.Series,
    ) -> TrackedObject | None:
        if raw is None:
            return None
        player_id = _optional_int(raw.get("player_id"))
        return TrackedObject(
            object_type="player",
            player_id=player_id,
            name=(None if player_id is None else context.player_names.get(player_id, f"Player {player_id}")),
            team_id=(None if player_id is None else context.player_teams.get(player_id)),
            team_name=(
                None
                if player_id is None
                else context.team_name(context.player_teams.get(player_id))
            ),
            x=_optional_float(raw.get("x")),
            y=_optional_float(raw.get("y")),
            is_detected=_optional_bool(raw.get("is_detected")),
            is_extrapolated=(
                None
                if _optional_bool(raw.get("is_detected")) is None
                else not bool(raw.get("is_detected"))
            ),
            is_passer=player_id == _optional_int(decision.passer_id),
            is_selected_receiver=player_id == _optional_int(decision.selected_receiver_id),
            is_highest_pvi=player_id == _optional_int(decision.best_pass_viability_receiver_id),
            is_best_same_frame_option=False,
        )

    def _frame_payload(
        self,
        decision_id: str,
        frame_number: int,
        decision: pd.Series,
        context: MatchContext,
        options: pd.DataFrame,
        raw: dict[str, Any],
    ) -> FramePayload:
        raw_players = raw.get("player_data") or []
        players = [
            tracked
            for tracked in (self._tracked_player(player, context, decision) for player in raw_players)
            if tracked is not None
        ]
        by_player = {player.player_id: player for player in players if player.player_id is not None}
        ball_data = raw.get("ball_data") or {}
        ball = TrackedObject(
            object_type="ball",
            x=_optional_float(ball_data.get("x")),
            y=_optional_float(ball_data.get("y")),
            is_detected=_optional_bool(ball_data.get("is_detected")),
            is_extrapolated=None,
        )
        passer = by_player.get(int(decision.passer_id))
        selected_receiver = by_player.get(int(decision.selected_receiver_id))
        alternative_ids = set(
            int(value) for value in options.loc[~options.is_selected, "receiver_id"].dropna().tolist()
        )
        alternatives = [player for player in players if player.player_id in alternative_ids]
        return FramePayload(
            decision_id=decision_id,
            frame_number=frame_number,
            frame_offset_from_pass=frame_number - int(decision.actual_pass_frame),
            period=_optional_int(raw.get("period")),
            match_clock=_text(raw.get("timestamp"), "Unavailable"),
            ball=ball,
            players=players,
            passer=passer,
            selected_receiver=selected_receiver,
            alternative_receivers=alternatives,
            ball_to_passer_distance=_distance(ball, passer),
            ball_to_selected_receiver_distance=_distance(ball, selected_receiver),
        )

    def frame(self, decision_id: str, frame_number: int) -> FramePayload:
        decision = self._decision_series(decision_id)
        match_id = int(decision.match_id)
        return self._frame_payload(
            decision_id,
            frame_number,
            decision,
            self._context(match_id),
            self.candidates_for_decision(decision_id),
            self._raw_frame(match_id, frame_number),
        )

    def timeline(self, decision_id: str, window: int = DEFAULT_TIMELINE_WINDOW) -> TimelineResponse:
        if window < 1 or window > MAX_TIMELINE_WINDOW:
            raise ValueError(f"Timeline window must be between 1 and {MAX_TIMELINE_WINDOW} frames.")
        decision = self._decision_series(decision_id)
        match_id = int(decision.match_id)
        pass_frame = int(decision.actual_pass_frame)
        index = self._tracking_index(match_id)
        available = [
            frame
            for frame in range(pass_frame - window, pass_frame + window + 1)
            if frame in index.offsets
        ]
        return TimelineResponse(
            decision_id=decision_id,
            provider_pass_frame=pass_frame,
            window_start=(min(available) if available else pass_frame),
            window_end=(max(available) if available else pass_frame),
            available_frames=available,
            markers=[
                TimelineMarker(label="Actual pass frame", frame=pass_frame, available=pass_frame in index.offsets),
            ],
        )

    def playback(
        self, decision_id: str, window: int = DEFAULT_TIMELINE_WINDOW
    ) -> PlaybackBundle:
        """Return a bounded source-frame clip for the local browser renderer."""
        timeline = self.timeline(decision_id, window)
        decision = self._decision_series(decision_id)
        match_id = int(decision.match_id)
        context = self._context(match_id)
        candidates = self.candidates_for_decision(decision_id)
        return PlaybackBundle(
            timeline=timeline,
            render_context=PlaybackRenderContext(
                pitch_length=float(decision.source_pitch_length),
                pitch_width=float(decision.source_pitch_width),
                attacking_team_id=int(decision.team_id),
            ),
            frames=[
                self._frame_payload(
                    decision_id,
                    frame_number,
                    decision,
                    context,
                    candidates,
                    self._raw_frame(match_id, frame_number),
                )
                for frame_number in timeline.available_frames
            ],
        )

    def _receiver_option(self, candidate: pd.Series, selected_delta: float | None) -> ReceiverOption:
        """Project an all-teammate candidate while retaining provider-field absence."""

        option_delta = _optional_float(candidate.same_frame_receiver_delta_xt)
        difference = (
            None
            if option_delta is None or selected_delta is None
            else option_delta - selected_delta
        )
        provider_id = _text(candidate.get("provider_option_id"), "")
        provider = self._provider_by_option_id.get(provider_id)
        provider_available = provider is not None
        confidence = _text(candidate.get("local_xpass_confidence"), "unavailable")
        if confidence not in {"high", "medium", "low", "unavailable"}:
            confidence = "unavailable"
        return ReceiverOption(
            option_id=str(candidate.candidate_id),
            receiver_id=int(candidate.receiver_id),
            receiver_name=_text(candidate.receiver_name),
            is_selected=bool(candidate.is_selected),
            is_highest_pvi=bool(candidate.get("is_highest_pvi", False)),
            is_provider_option=bool(candidate.is_provider_option),
            is_best_provider_alternative=bool(candidate.is_best_provider_alternative),
            tracking_quality=_text(candidate.local_xpass_confidence, "Unavailable"),
            same_frame=SameFrameMetrics(
                has_valid_location=bool(candidate.receiver_coordinate_valid),
                invalid_reason=_optional_text(candidate.local_xpass_invalid_reason),
                coordinate_in_playing_area=_optional_bool(
                    candidate.get("receiver_coordinate_in_playing_area")
                ),
                out_of_bounds_distance_m=_optional_float(
                    candidate.get("receiver_out_of_bounds_distance_m")
                ),
                open_xt_boundary_projected=bool(
                    candidate.get("open_xt_boundary_projected", False)
                ),
                receiver_x=_optional_float(candidate.same_frame_receiver_x),
                receiver_y=_optional_float(candidate.same_frame_receiver_y),
                open_xt=_optional_float(candidate.same_frame_receiver_xt),
                delta_xt=option_delta,
                rank=_optional_int(candidate.same_frame_receiver_xt_rank),
                difference_from_selected=difference,
            ),
            provider_peak=ProviderPeakMetrics(
                available=provider_available,
                peak_passing_option_frame=(
                    None if provider is None else _optional_int(provider.provider_peak_frame)
                ),
                peak_frame_offset=(
                    None if provider is None else _optional_int(provider.provider_peak_offset_frames)
                ),
                peak_frame_offset_seconds=(
                    None
                    if provider is None
                    else _optional_float(provider.provider_peak_offset_seconds)
                ),
                xpass=(None if provider is None else _optional_float(provider.skillcorner_peak_xpass)),
                xthreat=(None if provider is None else _optional_float(provider.skillcorner_peak_xthreat_10s)),
                option_score=(None if provider is None else _optional_float(provider.skillcorner_peak_passing_option_score)),
                expected_threat=(
                    None if provider is None else _optional_float(provider.skillcorner_peak_expected_threat)
                ),
                rank=(
                    None
                    if provider is None
                    else _optional_int(provider.provider_peak_expected_threat_rank)
                ),
                choice_objective=(
                    None
                    if provider is None
                    else _optional_float(provider.skillcorner_peak_selection_objective)
                ),
                composite_score=(
                    None
                    if provider is None
                    else _optional_float(provider.skillcorner_peak_composite_score)
                ),
                choice_rank=(
                    None
                    if provider is None
                    else _optional_int(provider.provider_peak_selection_objective_rank)
                ),
                passing_option_at_pass_moment=(
                    False if provider is None else bool(provider.passing_option_at_pass_moment)
                ),
                metrics_are_same_frame=(
                    None if provider is None else _optional_bool(provider.provider_metric_is_same_frame)
                ),
            ),
            local_xpass=LocalXPassMetrics(
                eligible=bool(candidate.local_xpass_eligible),
                invalid_reason=_optional_text(candidate.local_xpass_invalid_reason),
                confidence=cast(Any, confidence),
                xpass=_optional_float(candidate.local_xpass),
                rank=_optional_int(candidate.local_xpass_rank),
                availability_score=_optional_float(candidate.availability_score),
                model_version=_optional_text(candidate.local_xpass_model_version),
            ),
            pass_viability=PassViabilityMetrics(
                eligible=bool(candidate.get("pass_viability_eligible", False)),
                invalid_reason=_optional_text(candidate.get("pass_viability_invalid_reason")),
                score=_optional_float(candidate.get("pass_viability_score")),
                rank=_optional_int(candidate.get("pass_viability_rank")),
                xt_utility=_optional_float(candidate.get("pass_viability_xt_utility")),
                normalization_scale=_optional_float(
                    candidate.get("pass_viability_normalization_scale")
                ),
                version=_optional_text(candidate.get("pass_viability_version")),
            ),
        )

    def decision_details(self, decision_id: str) -> DecisionDetails:
        decision = self._decision_series(decision_id)
        summary = self.review_summary(decision_id)
        candidates = self.candidates_for_decision(decision_id).copy()
        selected_candidates = candidates.loc[candidates.is_selected.eq(True)]
        selected_candidate = None if selected_candidates.empty else selected_candidates.iloc[0]
        highest_pvi_candidates = candidates.loc[
            candidates.receiver_id.eq(_optional_int(decision.best_pass_viability_receiver_id))
        ]
        highest_pvi_candidate = None if highest_pvi_candidates.empty else highest_pvi_candidates.iloc[0]
        selected_delta = (
            None
            if selected_candidate is None
            else _optional_float(selected_candidate.same_frame_receiver_delta_xt)
        )
        candidates["_selected_order"] = (~candidates.is_selected).astype(int)
        candidates["is_highest_pvi"] = candidates.receiver_id.eq(
            _optional_int(decision.best_pass_viability_receiver_id)
        )
        candidates["_highest_pvi_order"] = (~candidates.is_highest_pvi).astype(int)
        candidates = candidates.sort_values(
            ["_selected_order", "_highest_pvi_order", "pass_viability_rank", "receiver_name", "candidate_id"],
            kind="stable",
            na_position="last",
        )
        return DecisionDetails(
            summary=summary,
            option_count=int(len(candidates)),
            passer_tracking_quality=_text(decision.tracking_quality, "Unavailable"),
            provider_pass_frame=int(decision.actual_pass_frame),
            selected_receiver=(
                None
                if selected_candidate is None
                else self._receiver_option(selected_candidate, selected_delta)
            ),
            highest_pvi_receiver=(
                None if highest_pvi_candidate is None else self._receiver_option(highest_pvi_candidate, selected_delta)
            ),
            best_same_frame_receiver=(
                None if highest_pvi_candidate is None else self._receiver_option(highest_pvi_candidate, selected_delta)
            ),
            options=[self._receiver_option(row, selected_delta) for _, row in candidates.iterrows()],
            metric_definitions=[
                "Same-frame open xT is the value of the receiver's tracking position at the actual pass frame using the versioned 12×8 open xT grid.",
                "Same-frame ΔxT is receiver open xT minus the observed pass-start open xT; it is a location-only review proxy, not proof of a correct pass.",
                "Local xPass v0 is a project-owned, calibrated completion estimate for a deliberately attempted pass to the named teammate at the actual pass frame; it is not a provider metric.",
                "Availability v0 is a transparent lane/interception proxy using a direct ground-pass convention and must not be interpreted as an observed outcome.",
                "Pass Viability Index v1 is a project-owned deterministic blend of Local xPass (65%) and bounded same-frame delta xT utility (35%); Availability remains an explanatory diagnostic, not a PVI input. It is neither a probability nor proof that the highest-scoring option was objectively correct.",
            ],
        )

def _optional_text(value: object) -> str | None:
    return None if _is_missing(value) else str(value)
