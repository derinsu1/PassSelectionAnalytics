import type { PropsWithChildren } from "react";

import { formatNumber, formatPercent, humanize } from "../format";
import type { AnnotationStatus, ReviewClassification } from "../types";

export function StatusBadge({ value, kind = "neutral" }: { value: string | null | undefined; kind?: "classification" | "annotation" | "neutral" }) {
  const normalized = value ?? "unavailable";
  return <span className={`status-badge status-badge--${kind}--${normalized}`}>{humanize(normalized)}</span>;
}

export function ClassificationBadge({ value }: { value: ReviewClassification }) {
  return <StatusBadge value={value} kind="classification" />;
}

export function AnnotationBadge({ value }: { value?: AnnotationStatus }) {
  return <StatusBadge value={value ?? "unreviewed"} kind="annotation" />;
}

export function MetricLabel({ label, help }: { label: string; help?: string }) {
  return <span className="metric-label"><span>{label}</span>{help ? <span className="metric-tooltip" aria-hidden="true">{help}</span> : null}</span>;
}

export function Metric({ label, value, detail, help, tone = "default" }: { label: string; value: string; detail?: string; help?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  return (
    <div className={`metric metric--${tone}`}>
      <span className="metric__label"><MetricLabel label={label} help={help} /></span>
      <strong className="metric__value">{value}</strong>
      {detail ? <span className="metric__detail">{detail}</span> : null}
    </div>
  );
}

export function NumberMetric({ label, value, digits = 3, detail, help, tone }: { label: string; value: number | null | undefined; digits?: number; detail?: string; help?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  return <Metric label={label} value={formatNumber(value, digits)} detail={detail} help={help} tone={tone} />;
}

export function PercentageMetric({ label, value, detail, help }: { label: string; value: number | null | undefined; detail?: string; help?: string }) {
  return <Metric label={label} value={formatPercent(value)} detail={detail} help={help} />;
}

export function LoadingBlock({ label = "Loading analytical data" }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="loading-block__bar" />
      <span className="loading-block__bar loading-block__bar--short" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <section className="state-card state-card--error" role="alert">
      <p className="eyebrow">Data request failed</p>
      <h2>The app could not load this view.</h2>
      <p>{error.message}</p>
      {retry ? <button type="button" className="button button--secondary" onClick={retry}>Try again</button> : null}
    </section>
  );
}

export function EmptyState({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="state-card state-card--empty">
      <p className="eyebrow">No matching decisions</p>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const copy = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.className = "visually-hidden";
    document.body.append(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  };
  return <button type="button" className="button button--quiet" onClick={() => void copy()}>{label}</button>;
}

export function Definition({ term, help, children }: PropsWithChildren<{ term: string; help?: string }>) {
  return (
    <div className="definition">
      <dt><MetricLabel label={term} help={help} /></dt>
      <dd>{children}</dd>
    </div>
  );
}
