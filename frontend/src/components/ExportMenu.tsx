import { useState } from "react";

import { apiPost, downloadExport } from "../api";
import type { Annotation } from "../types";

type ExportScope = "review_explorer" | "pass_inspector" | "player_directory" | "player_profile" | "player_comparison" | "methodology";

export interface ExportRequestState {
  scope: Exclude<ExportScope, "methodology">;
  review_filters?: object;
  review_sort_by?: string;
  review_sort_direction?: "asc" | "desc";
  decision_id?: string | null;
  player_id?: number | null;
  comparison_player_id?: number | null;
  player_filters?: object;
  timeline_window?: number;
}

function exportAnnotations(annotations: Annotation[]) {
  return annotations.map((annotation) => ({
    decision_id: annotation.decision_id,
    player_id: annotation.player_id,
    status: annotation.status,
    note: annotation.note,
    created_at: annotation.timestamp,
    updated_at: annotation.timestamp,
    author: "local analyst",
  }));
}

function reportDocument(title: string, payload: unknown): string {
  const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const data = payload as { scope?: string; export_scope?: string; active_filters?: unknown; data?: { annotations?: Array<Record<string, unknown>> } };
  const annotations = data.data?.annotations ?? [];
  const reviewRows = annotations.length ? annotations.map((annotation) => `<tr><td>${escape(annotation.decision_id ?? annotation.player_id ?? "No entity")}</td><td>${escape(annotation.status)}</td><td>${escape(annotation.note || "No analyst annotation recorded")}</td><td>${escape(annotation.created_at)}</td><td>${escape(annotation.updated_at)}</td></tr>`).join("") : "<tr><td colspan=5>No analyst annotation recorded</td></tr>";
  const encoded = escape(JSON.stringify(payload, null, 2));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,sans-serif;color:#17212b;line-height:1.45;margin:32px;max-width:1200px}h1{color:#123a5a}h2{margin-top:30px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5f7;border:1px solid #d6dde3;padding:16px}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #d6dde3;text-align:left;vertical-align:top}.notice{border-left:4px solid #b7791f;background:#fff8e6;padding:12px} @media print{body{margin:14mm}.no-print{display:none}pre{font-size:8pt}}</style></head><body>
    <h1>${title}</h1><p>Self-contained analytical export generated from the current application state.</p>
    <dl><dt>Export scope</dt><dd>${escape(data.export_scope ?? data.scope)}</dd><dt>Active filters</dt><dd>${escape(JSON.stringify(data.active_filters ?? {}))}</dd></dl>
    <section class="notice"><strong>Analyst Review:</strong> annotations are user-authored local review material, not canonical analytics. They do not change classifications, outcomes, metrics, or provider fields.</section>
    <h2>Analyst Review</h2><table><thead><tr><th>Entity</th><th>Manual status</th><th>Analyst note</th><th>Created</th><th>Updated</th></tr></thead><tbody>${reviewRows}</tbody></table>
    <h2>Export data</h2><pre>${encoded}</pre></body></html>`;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export function ExportMenu({ title, request, annotations = [], csv = false, methodology = false, reportRowCount }: { title: string; request?: ExportRequestState; annotations?: Annotation[]; csv?: boolean; methodology?: boolean; reportRowCount?: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const base = request ? { ...request, annotations: exportAnnotations(annotations) } : null;
  const reportTooLarge = !methodology && reportRowCount !== undefined && reportRowCount > 500;
  const runDownload = async (format: "xlsx" | "json" | "csv") => {
    if (!base) return;
    try { await downloadExport({ ...base, format }); setMessage(`${format.toUpperCase()} download started.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The export could not be created."); }
  };
  const report = async (print: boolean) => {
    if (reportTooLarge) {
      setMessage(`HTML and print/PDF reports are limited to 500 rows; this view has ${reportRowCount.toLocaleString()}. Use Excel, JSON, or CSV for the complete population.`);
      return;
    }
    const popup = print ? window.open("", "_blank", "width=1200,height=900") : null;
    if (print && !popup) {
      setMessage("The browser blocked the print report window.");
      return;
    }
    try {
      const payload = methodology ? { title, note: "Methodology is document content. Use HTML or PDF export.", state: window.location.href } : await apiPost<unknown>("/api/exports", { ...base, format: "json" });
      const html = reportDocument(title, payload);
      if (popup) {
        popup.document.write(html); popup.document.close(); popup.focus(); popup.print();
      } else downloadText(`${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "")}.html`, html);
      setMessage(print ? "Print report opened." : "Standalone HTML download started.");
    } catch (error) {
      popup?.close();
      setMessage(error instanceof Error ? error.message : "The report could not be created.");
    }
  };
  return <div className="export-menu" aria-label={`${title} export menu`}>
    <span className="panel-note">Export</span>
    <button type="button" className="button button--secondary" onClick={() => void report(false)} disabled={reportTooLarge} title={reportTooLarge ? "HTML reports are limited to 500 rows." : undefined}>HTML</button>
    <button type="button" className="button button--secondary" onClick={() => void report(true)} disabled={reportTooLarge} title={reportTooLarge ? "Print/PDF reports are limited to 500 rows." : undefined}>Print / PDF</button>
    {!methodology ? <><button type="button" className="button button--secondary" onClick={() => void runDownload("xlsx")}>Excel workbook</button><button type="button" className="button button--secondary" onClick={() => void runDownload("json")}>JSON</button>{csv ? <button type="button" className="button button--secondary" onClick={() => void runDownload("csv")}>CSV</button> : null}</> : <span className="panel-note">Methodology is document content. Use HTML or PDF export.</span>}
    {reportTooLarge ? <span className="panel-note">HTML/PDF is limited to 500 rows; data downloads include all rows.</span> : null}
    {message ? <span className="panel-note" role="status">{message}</span> : null}
  </div>;
}
