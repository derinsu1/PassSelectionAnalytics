export type ReviewClassification =
  | "stable_candidate"
  | "same_frame_only"
  | "provider_peak_only"
  | "methods_disagree"
  | "approximately_equivalent"
  | "selected_best"
  | "insufficient_quality";

export type PasserOriginThird = "defensive" | "middle" | "attacking";
export type PasserOriginSide = "left" | "center" | "right";
export type PercentileDirection = "higher_is_better" | "lower_is_better";
export type PercentileValueFormat = "number" | "percent";
export type AnnotationStatus =
  | "unreviewed"
  | "confirmed_coherent"
  | "suspicious"
  | "data_quality_issue"
  | "methodological_disagreement"
  | "useful_example"
  | "exclude_from_presentation";

export interface EntityOption {
  id: number;
  label: string;
}

export interface MatchOption extends EntityOption {
  home_team_id: number | null;
  home_team_name: string;
  away_team_id: number | null;
  away_team_name: string;
  score: string | null;
  date_time: string | null;
}

export interface PasserScope {
  match_id: number;
  team_id: number;
}

export interface PasserOption extends EntityOption {
  scopes: PasserScope[];
}

export interface FilterOptions {
  matches: MatchOption[];
  teams: EntityOption[];
  players: PasserOption[];
  review_classifications: ReviewClassification[];
  pass_outcomes: string[];
  review_metric_bounds: ReviewMetricBounds;
}

export interface ReviewMetricRange {
  minimum: number;
  maximum: number;
  step: number;
}

export interface ReviewMetricBounds {
  selected_rank: ReviewMetricRange;
  same_frame_margin: ReviewMetricRange;
  selected_pass_viability_score: ReviewMetricRange;
  pass_viability_gap: ReviewMetricRange;
}

export interface DataCounts {
  decisions: number;
  options: number;
  review_candidates: number;
}

export interface MetadataResponse {
  application: string;
  data_source: string;
  analytical_artifact_revision: string;
  counts: DataCounts;
  filter_options: FilterOptions;
}

export interface PlayerPassingStats {
  attempts: number;
  successful: number;
  unsuccessful: number;
  offside: number;
  resolved_attempts: number;
  attempts_per90: number | null;
  completions_per90: number | null;
  completion_rate: number | null;
  local_xpass: number | null;
  local_xpass_coverage: number;
  availability: number | null;
  availability_coverage: number;
  mean_local_xpass_rank: number | null;
  pvi: number | null;
  pvi_coverage: number;
  frame_best_pvi_selection_rate: number | null;
  mean_pvi_gap: number | null;
  execution_eligible_count: number;
  expected_completions: number | null;
  expected_completions_per90: number | null;
  completion_above_expected: number | null;
  completion_above_expected_per90: number | null;
  attacking_eligible_count: number;
  higher_open_xt_alternative_count: number;
  higher_open_xt_alternative_rate: number | null;
  higher_open_xt_alternatives_per90: number | null;
  mean_higher_open_xt_margin: number | null;
}

export interface PlayerReceivingStats {
  targets: number;
  successful: number;
  unsuccessful: number;
  offside: number;
  resolved_targets: number;
  targets_per90: number | null;
  successful_receptions_per90: number | null;
  target_completion_rate: number | null;
  local_xpass: number | null;
  local_xpass_coverage: number;
  availability: number | null;
  availability_coverage: number;
  pvi: number | null;
  pvi_coverage: number;
}

export interface PlayerPercentile {
  metric: string;
  label: string;
  value: number | null;
  percentile: number | null;
  peer_count: number;
  direction: PercentileDirection;
  value_format: PercentileValueFormat;
  headline: boolean;
}

export interface PlayerPercentileMetric {
  metric: string;
  label: string;
  direction: PercentileDirection;
  value_format: PercentileValueFormat;
  headline: boolean;
}

export interface PlayerStatSummary {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  player_role: string;
  percentile_position: string;
  appearances: number;
  regular_minutes: number;
  low_minutes_sample: boolean;
  passing: PlayerPassingStats;
  receiving: PlayerReceivingStats;
  selected_percentile: PlayerPercentile | null;
}

export interface PlayerMatchStats extends PlayerStatSummary {
  match_id: number;
  match_name: string;
}

export interface PlayerStatsFilters {
  match_id: number | null;
  team_id: number | null;
  search: string | null;
  hide_under_60: boolean;
  position: string | null;
  percentile_metric: string;
  min_percentile: number | null;
  max_percentile: number | null;
}

export interface PlayerStatsDirectoryResponse {
  items: PlayerStatSummary[];
  total: number;
  sort_by: string;
  sort_direction: "asc" | "desc";
  applied_filters: PlayerStatsFilters;
  positions: string[];
  percentile_metrics: PlayerPercentileMetric[];
}

export interface PlayerStatsDetailResponse extends PlayerStatSummary {
  match_breakdown: PlayerMatchStats[];
  percentiles: PlayerPercentile[];
}

export interface ReviewSummary {
  decision_id: string;
  match_id: number;
  match_name: string;
  period: number;
  frame: number;
  match_clock: string;
  team_id: number;
  team_name: string;
  passer_id: number;
  passer_name: string;
  passer_origin_third: PasserOriginThird | null;
  passer_origin_side: PasserOriginSide | null;
  selected_receiver_id: number;
  selected_receiver_name: string;
  selected_open_xt_rank: number | null;
  selected_open_xt: number | null;
  selected_open_xt_delta: number | null;
  highest_open_xt_receiver_id: number | null;
  highest_open_xt_receiver_name: string | null;
  highest_open_xt: number | null;
  highest_open_xt_delta: number | null;
  local_open_xt_margin: number | null;
  best_same_frame_receiver_id: number | null;
  best_same_frame_receiver_name: string | null;
  selected_rank: number | null;
  selected_same_frame_xt: number | null;
  selected_same_frame_delta_xt: number | null;
  best_same_frame_xt: number | null;
  best_same_frame_delta_xt: number | null;
  same_frame_margin: number | null;
  selected_local_xpass: number | null;
  selected_availability_score: number | null;
  selected_pass_viability_score: number | null;
  selected_pass_viability_rank: number | null;
  best_pass_viability_receiver_id: number | null;
  best_pass_viability_receiver_name: string | null;
  best_pass_viability_score: number | null;
  pass_viability_gap: number | null;
  selected_provider_choice_objective: number | null;
  selected_provider_composite_score: number | null;
  selected_provider_choice_rank: number | null;
  provider_choice_margin: number | null;
  provider_composite_score_margin: number | null;
  review_classification: ReviewClassification;
  is_review_candidate: boolean;
  provider_agreement: boolean | null;
  pass_outcome: string;
}

export interface ExplorerMetrics {
  decision_count: number;
  review_candidate_count: number;
  classification_distribution: Record<string, number>;
  median_same_frame_margin: number | null;
  p95_same_frame_margin: number | null;
  selected_pvi_eligible_count: number;
  median_selected_pass_viability_score: number | null;
  median_pass_viability_gap: number | null;
  selected_not_frame_best_pvi_count: number;
  median_selected_local_xpass: number | null;
  median_selected_availability_score: number | null;
  selected_provider_choice_coverage: number;
  median_selected_provider_choice_objective: number | null;
  median_selected_provider_composite_score: number | null;
  selected_not_provider_best_count: number;
  unique_matches: number;
  unique_passers: number;
  passer_origin_coverage: number;
  passer_origin_third_distribution: Record<PasserOriginThird, number>;
  passer_origin_side_distribution: Record<PasserOriginSide, number>;
}

export interface AppliedReviewFilters {
  match_id: number | null;
  team_id: number | null;
  passer_id: number | null;
  passer_origin_third: PasserOriginThird | null;
  passer_origin_side: PasserOriginSide | null;
  review_classification: string | null;
  review_candidate: boolean | null;
  pass_outcome: string | null;
  selected_rank: number | null;
  min_selected_rank: number | null;
  max_selected_rank: number | null;
  min_same_frame_margin: number | null;
  max_same_frame_margin: number | null;
  min_selected_pass_viability_score: number | null;
  max_selected_pass_viability_score: number | null;
  min_pass_viability_gap: number | null;
  max_pass_viability_gap: number | null;
  selected_pvi_not_best: boolean | null;
  provider_agreement: boolean | null;
  search: string | null;
}

export interface ReviewListResponse {
  items: ReviewSummary[];
  total: number;
  page: number;
  page_size: number;
  sort_by: string;
  sort_direction: "asc" | "desc";
  metrics: ExplorerMetrics;
  applied_filters: AppliedReviewFilters;
}

export interface ReviewNavigationResponse {
  decision_ids: string[];
  total: number;
}

export interface SameFrameMetrics {
  has_valid_location: boolean;
  invalid_reason: string | null;
  coordinate_in_playing_area?: boolean | null;
  out_of_bounds_distance_m?: number | null;
  open_xt_boundary_projected?: boolean;
  receiver_x: number | null;
  receiver_y: number | null;
  open_xt: number | null;
  delta_xt: number | null;
  rank: number | null;
  difference_from_selected: number | null;
}

export interface ProviderPeakMetrics {
  available: boolean;
  peak_passing_option_frame: number | null;
  peak_frame_offset: number | null;
  peak_frame_offset_seconds: number | null;
  xpass: number | null;
  xthreat: number | null;
  option_score: number | null;
  expected_threat: number | null;
  rank: number | null;
  choice_objective: number | null;
  composite_score: number | null;
  choice_rank: number | null;
  passing_option_at_pass_moment: boolean;
  metrics_are_same_frame: boolean | null;
}

export interface LocalXPassMetrics {
  eligible: boolean;
  invalid_reason: string | null;
  confidence: "high" | "medium" | "low" | "unavailable";
  xpass: number | null;
  rank: number | null;
  availability_score: number | null;
  model_version: string | null;
}

export interface PassViabilityMetrics {
  eligible: boolean;
  invalid_reason: string | null;
  score: number | null;
  rank: number | null;
  xt_utility: number | null;
  normalization_scale: number | null;
  version: string | null;
}

export interface ReceiverOption {
  option_id: string;
  receiver_id: number;
  receiver_name: string;
  is_selected: boolean;
  is_highest_pvi: boolean;
  is_provider_option: boolean;
  is_best_provider_alternative: boolean;
  tracking_quality: string | null;
  same_frame: SameFrameMetrics;
  provider_peak: ProviderPeakMetrics;
  local_xpass: LocalXPassMetrics;
  pass_viability: PassViabilityMetrics;
}

export interface TrackedObject {
  object_type: "ball" | "player" | "endpoint";
  player_id: number | null;
  name: string | null;
  team_id: number | null;
  team_name: string | null;
  x: number | null;
  y: number | null;
  is_detected: boolean | null;
  is_extrapolated: boolean | null;
  is_passer: boolean;
  is_selected_receiver: boolean;
  is_highest_pvi: boolean;
  is_best_same_frame_option: boolean;
}

export interface FramePayload {
  decision_id: string;
  frame_number: number;
  frame_offset_from_pass: number;
  period: number | null;
  match_clock: string | null;
  ball: TrackedObject;
  players: TrackedObject[];
  passer: TrackedObject | null;
  selected_receiver: TrackedObject | null;
  alternative_receivers: TrackedObject[];
  ball_to_passer_distance: number | null;
  ball_to_selected_receiver_distance: number | null;
}

export interface TimelineMarker {
  label: string;
  frame: number | null;
  available: boolean;
}

export interface TimelineResponse {
  decision_id: string;
  provider_pass_frame: number;
  window_start: number;
  window_end: number;
  available_frames: number[];
  markers: TimelineMarker[];
}

export interface PlaybackRenderContext {
  pitch_length: number;
  pitch_width: number;
  attacking_team_id: number;
}

export interface PlaybackBundle {
  timeline: TimelineResponse;
  render_context: PlaybackRenderContext;
  frames: FramePayload[];
}

export interface DecisionDetails {
  summary: ReviewSummary;
  option_count: number;
  passer_tracking_quality: string | null;
  provider_pass_frame: number;
  selected_receiver: ReceiverOption | null;
  highest_pvi_receiver: ReceiverOption | null;
  best_same_frame_receiver: ReceiverOption | null;
  options: ReceiverOption[];
  metric_definitions: string[];
}

export interface PitchCacheInfo {
  hits: number;
  misses: number;
  entries: number;
}

export interface Annotation {
  decision_id?: string;
  player_id?: number;
  status: AnnotationStatus;
  note: string;
  timestamp: string;
}
