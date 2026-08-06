from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ReviewClassification = Literal[
    "stable_candidate",
    "same_frame_only",
    "provider_peak_only",
    "methods_disagree",
    "approximately_equivalent",
    "selected_best",
    "insufficient_quality",
]
PassOutcome = Literal["successful", "unsuccessful", "offside"]
PasserOriginThird = Literal["defensive", "middle", "attacking"]
PasserOriginSide = Literal["left", "center", "right"]
PercentileDirection = Literal["higher_is_better", "lower_is_better"]
PercentileValueFormat = Literal["number", "percent"]


class ApiModel(BaseModel):
    """Strict response base so API shape changes are deliberate."""

    model_config = ConfigDict(extra="forbid")


class ErrorResponse(ApiModel):
    error: str
    message: str
    details: list[dict[str, object]] | None = None


class EntityOption(ApiModel):
    id: int
    label: str


class MatchOption(EntityOption):
    home_team_id: int | None = None
    home_team_name: str
    away_team_id: int | None = None
    away_team_name: str
    score: str | None = None
    date_time: str | None = None


class PasserScope(ApiModel):
    """A concrete match/team context in which a passer has published decisions."""

    match_id: int
    team_id: int


class PasserOption(EntityOption):
    scopes: list[PasserScope] = Field(default_factory=list)


class ReviewMetricRange(ApiModel):
    minimum: float
    maximum: float
    step: float


class ReviewMetricBounds(ApiModel):
    selected_rank: ReviewMetricRange
    same_frame_margin: ReviewMetricRange
    selected_pass_viability_score: ReviewMetricRange
    pass_viability_gap: ReviewMetricRange


class FilterOptions(ApiModel):
    matches: list[MatchOption]
    teams: list[EntityOption]
    players: list[PasserOption]
    review_classifications: list[str]
    pass_outcomes: list[str]
    review_metric_bounds: ReviewMetricBounds


class DataCounts(ApiModel):
    decisions: int
    options: int
    review_candidates: int


class HealthResponse(ApiModel):
    status: Literal["ok"]
    application: str
    artifact_source: str
    counts: DataCounts


class MetadataResponse(ApiModel):
    application: str
    data_source: str
    analytical_artifact_revision: str
    counts: DataCounts
    filter_options: FilterOptions


class PlayerPassingStats(ApiModel):
    """Observed pass selection, safety, execution, and attacking-value summaries."""

    attempts: int
    successful: int
    unsuccessful: int
    offside: int
    resolved_attempts: int
    attempts_per90: float | None = None
    completions_per90: float | None = None
    completion_rate: float | None = None
    local_xpass: float | None = None
    local_xpass_coverage: int = 0
    availability: float | None = None
    availability_coverage: int = 0
    mean_local_xpass_rank: float | None = None
    pvi: float | None = None
    pvi_coverage: int = 0
    frame_best_pvi_selection_rate: float | None = None
    mean_pvi_gap: float | None = None
    execution_eligible_count: int = 0
    expected_completions: float | None = None
    expected_completions_per90: float | None = None
    completion_above_expected: float | None = None
    completion_above_expected_per90: float | None = None
    attacking_eligible_count: int = 0
    higher_open_xt_alternative_count: int = 0
    higher_open_xt_alternative_rate: float | None = None
    higher_open_xt_alternatives_per90: float | None = None
    mean_higher_open_xt_margin: float | None = None


class PlayerReceivingStats(ApiModel):
    """Results and same-frame context for passes teammates selected to this player."""

    targets: int
    successful: int
    unsuccessful: int
    offside: int
    resolved_targets: int
    targets_per90: float | None = None
    successful_receptions_per90: float | None = None
    target_completion_rate: float | None = None
    local_xpass: float | None = None
    local_xpass_coverage: int = 0
    availability: float | None = None
    availability_coverage: int = 0
    pvi: float | None = None
    pvi_coverage: int = 0


class PlayerPercentile(ApiModel):
    metric: str
    label: str
    value: float | None = None
    percentile: float | None = None
    peer_count: int = 0
    direction: PercentileDirection
    value_format: PercentileValueFormat
    headline: bool = False


class PlayerPercentileMetric(ApiModel):
    metric: str
    label: str
    direction: PercentileDirection
    value_format: PercentileValueFormat
    headline: bool = False


class PlayerStatSummary(ApiModel):
    player_id: int
    player_name: str
    team_id: int
    team_name: str
    player_role: str
    percentile_position: str
    appearances: int
    regular_minutes: float
    low_minutes_sample: bool
    passing: PlayerPassingStats
    receiving: PlayerReceivingStats
    selected_percentile: PlayerPercentile | None = None


class PlayerMatchStats(PlayerStatSummary):
    match_id: int
    match_name: str


class PlayerStatsFilters(ApiModel):
    match_id: int | None = None
    team_id: int | None = None
    search: str | None = None
    hide_under_60: bool = True
    position: str | None = None
    percentile_metric: str = "pvi"
    min_percentile: float | None = None
    max_percentile: float | None = None


class PlayerStatsDirectoryResponse(ApiModel):
    items: list[PlayerStatSummary]
    total: int
    sort_by: str
    sort_direction: Literal["asc", "desc"]
    applied_filters: PlayerStatsFilters
    positions: list[str]
    percentile_metrics: list[PlayerPercentileMetric]


class PlayerStatsDetailResponse(PlayerStatSummary):
    match_breakdown: list[PlayerMatchStats]
    percentiles: list[PlayerPercentile]


class ReviewSummary(ApiModel):
    decision_id: str
    match_id: int
    match_name: str
    period: int
    frame: int
    match_clock: str
    team_id: int
    team_name: str
    passer_id: int
    passer_name: str
    passer_origin_third: PasserOriginThird | None = None
    passer_origin_side: PasserOriginSide | None = None
    selected_receiver_id: int
    selected_receiver_name: str
    selected_open_xt_rank: int | None = None
    selected_open_xt: float | None = None
    selected_open_xt_delta: float | None = None
    highest_open_xt_receiver_id: int | None = None
    highest_open_xt_receiver_name: str | None = None
    highest_open_xt: float | None = None
    highest_open_xt_delta: float | None = None
    local_open_xt_margin: float | None = None
    best_same_frame_receiver_id: int | None = None
    best_same_frame_receiver_name: str | None = None
    selected_rank: int | None = None
    selected_same_frame_xt: float | None = None
    selected_same_frame_delta_xt: float | None = None
    best_same_frame_xt: float | None = None
    best_same_frame_delta_xt: float | None = None
    same_frame_margin: float | None = None
    selected_local_xpass: float | None = None
    selected_availability_score: float | None = None
    selected_pass_viability_score: float | None = None
    selected_pass_viability_rank: int | None = None
    best_pass_viability_receiver_id: int | None = None
    best_pass_viability_receiver_name: str | None = None
    best_pass_viability_score: float | None = None
    pass_viability_gap: float | None = None
    selected_provider_choice_objective: float | None = None
    selected_provider_composite_score: float | None = None
    selected_provider_choice_rank: int | None = None
    provider_choice_margin: float | None = None
    provider_composite_score_margin: float | None = None
    review_classification: ReviewClassification
    is_review_candidate: bool
    provider_agreement: bool | None = None
    pass_outcome: PassOutcome


class ExplorerMetrics(ApiModel):
    decision_count: int
    review_candidate_count: int
    classification_distribution: dict[str, int]
    median_same_frame_margin: float | None = None
    p95_same_frame_margin: float | None = None
    selected_pvi_eligible_count: int = 0
    median_selected_pass_viability_score: float | None = None
    median_pass_viability_gap: float | None = None
    selected_not_frame_best_pvi_count: int = 0
    median_selected_local_xpass: float | None = None
    median_selected_availability_score: float | None = None
    selected_provider_choice_coverage: int = 0
    median_selected_provider_choice_objective: float | None = None
    median_selected_provider_composite_score: float | None = None
    selected_not_provider_best_count: int = 0
    unique_matches: int
    unique_passers: int
    passer_origin_coverage: int = 0
    passer_origin_third_distribution: dict[str, int] = Field(default_factory=dict)
    passer_origin_side_distribution: dict[str, int] = Field(default_factory=dict)


class AppliedReviewFilters(ApiModel):
    match_id: int | None = None
    team_id: int | None = None
    passer_id: int | None = None
    passer_origin_third: PasserOriginThird | None = None
    passer_origin_side: PasserOriginSide | None = None
    review_classification: str | None = None
    review_candidate: bool | None = None
    pass_outcome: str | None = None
    selected_rank: int | None = None
    min_selected_rank: int | None = None
    max_selected_rank: int | None = None
    min_same_frame_margin: float | None = None
    max_same_frame_margin: float | None = None
    min_selected_pass_viability_score: float | None = None
    max_selected_pass_viability_score: float | None = None
    min_pass_viability_gap: float | None = None
    max_pass_viability_gap: float | None = None
    selected_pvi_not_best: bool | None = None
    provider_agreement: bool | None = None
    search: str | None = None


class ReviewListResponse(ApiModel):
    items: list[ReviewSummary]
    total: int
    page: int
    page_size: int
    sort_by: str
    sort_direction: Literal["asc", "desc"]
    metrics: ExplorerMetrics
    applied_filters: AppliedReviewFilters


class ReviewNavigationResponse(ApiModel):
    """Ordered decision IDs for Inspector previous/next controls."""

    decision_ids: list[str]
    total: int


class SameFrameMetrics(ApiModel):
    has_valid_location: bool
    invalid_reason: str | None = None
    coordinate_in_playing_area: bool | None = None
    out_of_bounds_distance_m: float | None = None
    open_xt_boundary_projected: bool = False
    receiver_x: float | None = None
    receiver_y: float | None = None
    open_xt: float | None = None
    delta_xt: float | None = None
    rank: int | None = None
    difference_from_selected: float | None = None


class ProviderPeakMetrics(ApiModel):
    available: bool
    peak_passing_option_frame: int | None = None
    peak_frame_offset: int | None = None
    peak_frame_offset_seconds: float | None = None
    xpass: float | None = None
    xthreat: float | None = None
    option_score: float | None = None
    expected_threat: float | None = None
    rank: int | None = None
    choice_objective: float | None = None
    composite_score: float | None = None
    choice_rank: int | None = None
    passing_option_at_pass_moment: bool
    metrics_are_same_frame: bool | None = None


class LocalXPassMetrics(ApiModel):
    """Project-owned actual-frame estimate, never a provider metric."""

    eligible: bool
    invalid_reason: str | None = None
    confidence: Literal["high", "medium", "low", "unavailable"]
    xpass: float | None = None
    rank: int | None = None
    availability_score: float | None = None


class PassViabilityMetrics(ApiModel):
    """Project-owned deterministic same-frame safety/value composite."""

    eligible: bool
    invalid_reason: str | None = None
    score: float | None = None
    rank: int | None = None
    xt_utility: float | None = None
    normalization_scale: float | None = None
    version: str | None = None


class ReceiverOption(ApiModel):
    option_id: str
    receiver_id: int
    receiver_name: str
    is_selected: bool
    is_highest_pvi: bool = False
    is_provider_option: bool
    is_best_provider_alternative: bool
    tracking_quality: str | None = None
    same_frame: SameFrameMetrics
    provider_peak: ProviderPeakMetrics
    local_xpass: LocalXPassMetrics
    pass_viability: PassViabilityMetrics


class TrackedObject(ApiModel):
    object_type: Literal["ball", "player", "endpoint"]
    player_id: int | None = None
    name: str | None = None
    team_id: int | None = None
    team_name: str | None = None
    x: float | None = None
    y: float | None = None
    is_detected: bool | None = None
    is_extrapolated: bool | None = None
    is_passer: bool = False
    is_selected_receiver: bool = False
    is_highest_pvi: bool = False
    is_best_same_frame_option: bool = False


class FramePayload(ApiModel):
    decision_id: str
    frame_number: int
    frame_offset_from_pass: int
    period: int | None = None
    match_clock: str | None = None
    ball: TrackedObject
    players: list[TrackedObject]
    passer: TrackedObject | None = None
    selected_receiver: TrackedObject | None = None
    alternative_receivers: list[TrackedObject] = Field(default_factory=list)
    ball_to_passer_distance: float | None = None
    ball_to_selected_receiver_distance: float | None = None


class TimelineMarker(ApiModel):
    label: str
    frame: int | None = None
    available: bool


class TimelineResponse(ApiModel):
    decision_id: str
    provider_pass_frame: int
    window_start: int
    window_end: int
    available_frames: list[int]
    markers: list[TimelineMarker]


class PlaybackRenderContext(ApiModel):
    """Canonical display facts shared by every frame in an inspector clip."""

    pitch_length: float
    pitch_width: float
    attacking_team_id: int


class PlaybackBundle(ApiModel):
    """A bounded, source-frame-only clip for locally rendered playback."""

    timeline: TimelineResponse
    render_context: PlaybackRenderContext
    frames: list[FramePayload]


class DecisionDetails(ApiModel):
    summary: ReviewSummary
    option_count: int
    passer_tracking_quality: str | None = None
    provider_pass_frame: int
    selected_receiver: ReceiverOption | None = None
    highest_pvi_receiver: ReceiverOption | None = None
    # Retained for technical API compatibility. Analyst clients use
    # ``highest_pvi_receiver`` instead.
    best_same_frame_receiver: ReceiverOption | None = None
    options: list[ReceiverOption]
    metric_definitions: list[str]


class PitchCacheInfo(ApiModel):
    hits: int
    misses: int
    entries: int
