import { formatOrdinal } from "../format";
import type { PlayerPercentile } from "../types";

function band(value: number | null) {
  if (value === null) return "unavailable";
  if (value < 34) return "low";
  if (value < 67) return "middle";
  return "high";
}

export function PercentileGauge({ metric, position, help }: { metric: PlayerPercentile; position: string; help?: string }) {
  const percentile = metric.percentile;
  const safePercentile = percentile === null ? 0 : Math.max(0, Math.min(100, percentile));
  const radians = Math.PI - safePercentile / 100 * Math.PI;
  const origin = { x: 80, y: 78 };
  const radius = 60;
  const endpoint = {
    x: origin.x + Math.cos(radians) * radius,
    y: origin.y - Math.sin(radians) * radius,
  };
  const sector = `M 20 78 A 60 60 0 0 1 ${endpoint.x} ${endpoint.y} L 80 78 Z`;
  const percentileLabelX = endpoint.x + (safePercentile < 22 ? -5 : 5);
  const percentileLabelY = endpoint.y - 7;
  const percentileLabelAnchor = safePercentile < 22 ? "end" : "start";
  const direction = metric.direction === "lower_is_better" ? "Lower is stronger" : "Higher is stronger";
  const unavailableReason = metric.peer_count < 5
    ? "percentile unavailable; fewer than five eligible positional peers"
    : "no observed player value for this metric";
  const accessibleLabel = percentile === null
    ? `${metric.label}: ${unavailableReason} in the ${position} cohort.`
    : `${metric.label}: ${formatOrdinal(percentile)} percentile from ${metric.peer_count} eligible positional peers. ${direction}.`;
  const tooltip = `${help ?? metric.label} ${accessibleLabel} The sector fills from 0 to 100; colour is normalized to the metric direction.`;

  return (
    <span className={`metric-label percentile-gauge percentile-gauge--compact percentile-gauge--${band(percentile)}`} role="img" aria-label={accessibleLabel}>
      <svg viewBox="0 0 160 102" aria-hidden="true">
        {percentile === null ? <path className="percentile-gauge__empty-sector" d="M 20 78 A 60 60 0 0 1 140 78 L 80 78 Z" /> : <path className="percentile-gauge__sector" d={sector} />}
        {percentile === null ? null : <text className="percentile-gauge__percentile" x={percentileLabelX} y={percentileLabelY} textAnchor={percentileLabelAnchor}>{formatOrdinal(percentile)}</text>}
        <text className="percentile-gauge__zero" x="17" y="95">0</text><text className="percentile-gauge__hundred" x="135" y="95">100</text>
      </svg>
      <span className="metric-tooltip" aria-hidden="true">{tooltip}</span>
    </span>
  );
}
