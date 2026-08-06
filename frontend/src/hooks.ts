import { useCallback, useEffect, useMemo, useState } from "react";

import type { Annotation, AnnotationStatus } from "./types";

const annotationStorageKey = "pass-selection-analytics-annotations-v1";

function annotationKey(annotation: Annotation) {
  return annotation.decision_id ?? `player:${annotation.player_id}`;
}

function readAnnotations(): Record<string, Annotation> {
  try {
    const raw = window.localStorage.getItem(annotationStorageKey);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      parsed
        .filter((item): item is Annotation => {
          if (!item || typeof item !== "object") return false;
          const candidate = item as Partial<Annotation>;
          return (typeof candidate.decision_id === "string" || typeof candidate.player_id === "number") && typeof candidate.status === "string" && typeof candidate.note === "string" && typeof candidate.timestamp === "string";
        })
        .map((item) => [annotationKey(item), item]),
    );
  } catch {
    return {};
  }
}

export function useAnnotations() {
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>(readAnnotations);

  useEffect(() => {
    window.localStorage.setItem(annotationStorageKey, JSON.stringify(Object.values(annotations)));
  }, [annotations]);

  const update = useCallback((decisionId: string, status: AnnotationStatus, note: string) => {
    setAnnotations((previous) => ({
      ...previous,
      [decisionId]: { decision_id: decisionId, status, note, timestamp: new Date().toISOString() },
    }));
  }, []);
  const updatePlayer = useCallback((playerId: number, status: AnnotationStatus, note: string) => {
    setAnnotations((previous) => ({
      ...previous,
      [`player:${playerId}`]: { player_id: playerId, status, note, timestamp: new Date().toISOString() },
    }));
  }, []);

  const importAnnotations = useCallback((value: unknown) => {
    if (!Array.isArray(value)) {
      throw new Error("An annotation export must be a JSON array.");
    }
    const next: Record<string, Annotation> = {};
    value.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const candidate = item as Partial<Annotation>;
      if ((typeof candidate.decision_id !== "string" && typeof candidate.player_id !== "number") || typeof candidate.status !== "string" || typeof candidate.note !== "string" || typeof candidate.timestamp !== "string") return;
      const annotation = candidate as Annotation;
      next[annotationKey(annotation)] = annotation;
    });
    setAnnotations(next);
  }, []);

  const clear = useCallback(() => setAnnotations({}), []);
  const values = useMemo(() => Object.values(annotations).sort((a, b) => annotationKey(a).localeCompare(annotationKey(b))), [annotations]);
  return { annotations, values, update, updatePlayer, importAnnotations, clear };
}
