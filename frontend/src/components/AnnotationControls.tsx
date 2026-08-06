import { useEffect, useRef, useState } from "react";

import { AnnotationBadge } from "./Common";
import type { Annotation, AnnotationStatus } from "../types";

const statuses: Array<{ value: AnnotationStatus; label: string }> = [
  { value: "unreviewed", label: "Unreviewed" },
  { value: "confirmed_coherent", label: "Confirmed coherent" },
  { value: "suspicious", label: "Suspicious" },
  { value: "data_quality_issue", label: "Data-quality issue" },
  { value: "methodological_disagreement", label: "Methodological disagreement" },
  { value: "useful_example", label: "Useful example" },
  { value: "exclude_from_presentation", label: "Exclude from presentation" },
];

export interface AnnotationStore {
  annotations: Record<string, Annotation>;
  values: Annotation[];
  update: (decisionId: string, status: AnnotationStatus, note: string) => void;
  updatePlayer: (playerId: number, status: AnnotationStatus, note: string) => void;
  importAnnotations: (value: unknown) => void;
  clear: () => void;
}

export function AnnotationControls({ decisionId, playerId, store }: { decisionId?: string; playerId?: number; store: AnnotationStore }) {
  const annotationKey = decisionId ?? `player:${playerId}`;
  const existing = store.annotations[annotationKey];
  const [status, setStatus] = useState<AnnotationStatus>(existing?.status ?? "unreviewed");
  const [note, setNote] = useState(existing?.note ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStatus(existing?.status ?? "unreviewed");
    setNote(existing?.note ?? "");
  }, [annotationKey, existing?.note, existing?.status]);

  useEffect(() => {
    setMessage(null);
  }, [annotationKey]);

  const save = () => {
    if (decisionId) store.update(decisionId, status, note);
    else if (playerId !== undefined) store.updatePlayer(playerId, status, note);
    setMessage("Annotation saved locally.");
  };
  const exportAll = () => {
    const blob = new Blob([JSON.stringify(store.values, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pass-selection-analytics-annotations.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      store.importAnnotations(JSON.parse(await file.text()));
      setMessage("Annotations imported into this browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The annotation file could not be imported.");
    }
  };
  const clear = () => {
    if (window.confirm("Clear all locally stored annotations? This cannot be undone from the browser.")) {
      store.clear();
      setStatus("unreviewed");
      setNote("");
      setMessage("All local annotations were cleared.");
    }
  };

  return (
    <section className="annotation-panel" aria-labelledby="annotation-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Local analyst QA</p>
          <h2 id="annotation-heading">Manual annotation</h2>
        </div>
        <AnnotationBadge value={existing?.status ?? "unreviewed"} />
      </div>
      <label>
        Manual status
        <select value={status} onChange={(event) => setStatus(event.target.value as AnnotationStatus)}>
          {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>
        Finding or rationale
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record an observation without changing the canonical analytics." rows={4} />
      </label>
      <div className="annotation-panel__actions">
        <button type="button" className="button button--primary" onClick={save}>Save locally</button>
        <button type="button" className="button button--secondary" onClick={exportAll}>Export JSON</button>
        <button type="button" className="button button--secondary" onClick={() => input.current?.click()}>Import JSON</button>
        <button type="button" className="button button--danger" onClick={clear}>Clear all</button>
        <input ref={input} type="file" accept="application/json" aria-label="Import annotation JSON file" className="visually-hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
      </div>
      {existing ? <p className="annotation-panel__timestamp">Last saved {new Date(existing.timestamp).toLocaleString()}</p> : null}
      {message ? <p className="annotation-panel__message" role="status">{message}</p> : null}
    </section>
  );
}
