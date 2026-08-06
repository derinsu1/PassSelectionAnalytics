export function formatNumber(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined || Number.isNaN(value) ? "N/A" : value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || Number.isNaN(value) ? "N/A" : `${(value * 100).toFixed(digits)}%`;
}

export function formatOrdinal(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const integer = Math.round(value);
  const remainder = integer % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? "th"
    : integer % 10 === 1 ? "st" : integer % 10 === 2 ? "nd" : integer % 10 === 3 ? "rd" : "th";
  return `${integer}${suffix}`;
}

export function humanize(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Unavailable";
}

export function relativeFrame(value: number | null): string {
  return value === null ? "N/A" : value === 0 ? "pass frame" : `${value > 0 ? "+" : ""}${value} frames`;
}
