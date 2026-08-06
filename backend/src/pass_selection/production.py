from dataclasses import dataclass

PLAYER_MATCH_STATS_FILENAME = "player_match_stats.parquet"
PLAYER_STATS_FILENAME = "player_stats.parquet"


@dataclass(frozen=True)
class PercentileMetricDefinition:
    code: str
    label: str
    column: str
    direction: str
    value_format: str
    headline: bool = False


PERCENTILE_METRICS: tuple[PercentileMetricDefinition, ...] = (
    PercentileMetricDefinition("passes_per90", "Passes /90", "passing_attempts_per90", "higher_is_better", "number", True),
    PercentileMetricDefinition("completions_per90", "Completed passes /90", "passing_completions_per90", "higher_is_better", "number"),
    PercentileMetricDefinition("completion_rate", "Pass completion", "passing_completion_rate", "higher_is_better", "percent", True),
    PercentileMetricDefinition("local_xpass", "Selected Local xPass", "passing_local_xpass", "higher_is_better", "number", True),
    PercentileMetricDefinition("availability", "Selected Availability", "passing_availability", "higher_is_better", "number", True),
    PercentileMetricDefinition("mean_local_xpass_rank", "Mean Local xPass rank", "passing_mean_local_xpass_rank", "lower_is_better", "number"),
    PercentileMetricDefinition("pvi", "Selected PVI", "passing_pvi", "higher_is_better", "number", True),
    PercentileMetricDefinition("pvi_best_rate", "Frame-best PVI selection", "passing_frame_best_pvi_selection_rate", "higher_is_better", "percent", True),
    PercentileMetricDefinition("mean_pvi_gap", "Mean PVI gap", "passing_mean_pvi_gap", "lower_is_better", "number"),
    PercentileMetricDefinition("expected_completions_per90", "Expected completions /90", "passing_expected_completions_per90", "higher_is_better", "number"),
    PercentileMetricDefinition("completion_above_expected_per90", "Completion above Local xPass /90", "passing_completion_above_expected_per90", "higher_is_better", "number", True),
    PercentileMetricDefinition("higher_open_xt_alternative_rate", "Higher open-xT alternative rate", "passing_higher_open_xt_alternative_rate", "lower_is_better", "percent"),
    PercentileMetricDefinition("higher_open_xt_per90", "Higher open-xT alternatives /90", "passing_higher_open_xt_alternatives_per90", "lower_is_better", "number", True),
    PercentileMetricDefinition("mean_higher_open_xt_margin", "Mean higher open-xT margin", "passing_mean_higher_open_xt_margin", "lower_is_better", "number"),
    PercentileMetricDefinition("targets_per90", "Targets /90", "receiving_targets_per90", "higher_is_better", "number", True),
    PercentileMetricDefinition("successful_receptions_per90", "Successful receptions /90", "receiving_successful_receptions_per90", "higher_is_better", "number", True),
    PercentileMetricDefinition("target_completion_rate", "Target completion", "receiving_target_completion_rate", "higher_is_better", "percent", True),
    PercentileMetricDefinition("target_local_xpass", "Target Local xPass", "receiving_local_xpass", "higher_is_better", "number"),
    PercentileMetricDefinition("target_availability", "Target Availability", "receiving_availability", "higher_is_better", "number"),
    PercentileMetricDefinition("target_pvi", "Target PVI", "receiving_pvi", "higher_is_better", "number", True),
)
PERCENTILE_METRICS_BY_CODE = {metric.code: metric for metric in PERCENTILE_METRICS}
