import { useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

export interface NumericRange {
  minimum: number;
  maximum: number;
  step: number;
}

function clamp(value: string, range: NumericRange, fallback: number) {
  const numeric = Number(value);
  return value === "" || !Number.isFinite(numeric) ? fallback : Math.min(range.maximum, Math.max(range.minimum, numeric));
}

function precision(range: NumericRange) {
  return range.step < 0.01 ? 5 : range.step < 1 ? 1 : 0;
}

export function rangeValueLabel(value: number, range: NumericRange) {
  return Number(value.toFixed(precision(range))).toString();
}

export function RangeControl({
  label,
  minimumLabel,
  maximumLabel,
  minimumValue,
  maximumValue,
  onMinimumChange,
  onMaximumChange,
  range,
  minimumError,
  maximumError,
}: {
  label: string;
  minimumLabel: string;
  maximumLabel: string;
  minimumValue: string;
  maximumValue: string;
  onMinimumChange: (value: string) => void;
  onMaximumChange: (value: string) => void;
  range: NumericRange;
  minimumError?: string | null;
  maximumError?: string | null;
}) {
  const [editing, setEditing] = useState<"minimum" | "maximum" | null>(null);
  const visualMinimum = clamp(minimumValue, range, range.minimum);
  const visualMaximum = clamp(maximumValue, range, range.maximum);
  const lower = Math.min(visualMinimum, visualMaximum);
  const upper = Math.max(visualMinimum, visualMaximum);
  const denominator = range.maximum - range.minimum || 1;
  const start = ((lower - range.minimum) / denominator) * 100;
  const end = ((upper - range.minimum) / denominator) * 100;
  const minimumId = `range-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-minimum`;
  const maximumId = `range-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-maximum`;
  const commit = (kind: "minimum" | "maximum", value: string) => {
    if (kind === "minimum") onMinimumChange(value);
    else onMaximumChange(value);
    setEditing(null);
  };
  const onValueKeyDown = (event: KeyboardEvent<HTMLInputElement>, kind: "minimum" | "maximum") => {
    if (event.key === "Enter") commit(kind, event.currentTarget.value);
    if (event.key === "Escape") setEditing(null);
  };
  const valueChip = (kind: "minimum" | "maximum", value: string, valueLabel: string, error: string | null | undefined, id: string) => editing === kind
    ? <label className={error ? "range-control__chip range-control__chip--editing range-control__chip--invalid" : "range-control__chip range-control__chip--editing"} htmlFor={id}><span>{kind === "minimum" ? minimumLabel : maximumLabel}</span><input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} autoFocus type="number" min={range.minimum} max={range.maximum} step={range.step} value={value} placeholder="Any" onChange={(event) => kind === "minimum" ? onMinimumChange(event.target.value) : onMaximumChange(event.target.value)} onBlur={(event) => commit(kind, event.target.value)} onKeyDown={(event) => onValueKeyDown(event, kind)} /></label>
    : <button type="button" className={error ? "range-control__chip range-control__chip--invalid" : "range-control__chip"} onClick={() => setEditing(kind)} aria-label={`Edit ${kind === "minimum" ? minimumLabel : maximumLabel} for ${label}`}><span>{kind === "minimum" ? minimumLabel : maximumLabel}</span><strong>{value === "" ? "Any" : valueLabel}</strong></button>;

  return <fieldset className="range-control"><legend>{label}</legend><div className="range-control__values">{valueChip("minimum", minimumValue, rangeValueLabel(visualMinimum, range), minimumError, minimumId)}{valueChip("maximum", maximumValue, rangeValueLabel(visualMaximum, range), maximumError, maximumId)}</div><div className="dual-range" style={{ "--range-start": `${start}%`, "--range-end": `${end}%` } as CSSProperties}><input aria-label={`${label} minimum slider`} type="range" min={range.minimum} max={range.maximum} step={range.step} value={lower} onChange={(event) => onMinimumChange(String(Math.min(Number(event.target.value), upper)))} /><input aria-label={`${label} maximum slider`} type="range" min={range.minimum} max={range.maximum} step={range.step} value={upper} onChange={(event) => onMaximumChange(String(Math.max(Number(event.target.value), lower)))} /></div><div className="range-control__bounds"><span>{rangeValueLabel(range.minimum, range)}</span><span>{rangeValueLabel(range.maximum, range)}</span></div>{minimumError ? <span id={`${minimumId}-error`} className="filter-error" role="alert">{minimumError}</span> : null}{maximumError ? <span id={`${maximumId}-error`} className="filter-error" role="alert">{maximumError}</span> : null}</fieldset>;
}
