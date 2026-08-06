import { useEffect, useState } from "react";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const apiBase = import.meta.env.VITE_API_BASE ?? "";
const cachedPlaybackResponses = new Map<string, unknown>();
const playbackCacheLimit = 3;

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { signal });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // The status message remains useful when a proxy or development server returns HTML.
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      message = ((await response.json()) as { message?: string }).message ?? message;
    } catch {
      // A proxy can return HTML on failures.
    }
    throw new ApiError(response.status, message);
  }
  return await response.json() as T;
}

export async function downloadExport(body: unknown): Promise<void> {
  const response = await fetch(`${apiBase}/api/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Export failed (${response.status})`;
    try { message = ((await response.json()) as { message?: string }).message ?? message; } catch { /* keep status */ }
    throw new ApiError(response.status, message);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? "pass-selection-analytics-export";
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface RemoteState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export function useApi<T>(path: string | null): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({ data: null, error: null, loading: Boolean(path) });

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ data: previous.data, error: null, loading: true }));
    void apiGet<T>(path, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({ data: null, error: error instanceof Error ? error : new Error("Unknown API error"), loading: false });
      });
    return () => controller.abort();
  }, [path]);

  return state;
}

function cachePlayback(path: string, value: unknown) {
  cachedPlaybackResponses.delete(path);
  cachedPlaybackResponses.set(path, value);
  while (cachedPlaybackResponses.size > playbackCacheLimit) {
    const oldest = cachedPlaybackResponses.keys().next().value;
    if (oldest === undefined) return;
    cachedPlaybackResponses.delete(oldest);
  }
}

/**
 * Playback clips are immutable published-source views. Keeping a few clips locally
 * makes replay, scrubbing, and a quick return to a prior decision network-free.
 */
export function usePlaybackApi<T>(path: string | null): RemoteState<T> {
  const cached = path ? cachedPlaybackResponses.get(path) as T | undefined : undefined;
  const [state, setState] = useState<RemoteState<T>>({
    data: cached ?? null,
    error: null,
    loading: Boolean(path && !cached),
  });

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const fromCache = cachedPlaybackResponses.get(path) as T | undefined;
    if (fromCache) {
      cachePlayback(path, fromCache);
      setState({ data: fromCache, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    void apiGet<T>(path, controller.signal)
      .then((data) => {
        cachePlayback(path, data);
        setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ data: null, error: error instanceof Error ? error : new Error("Unknown API error"), loading: false });
      });
    return () => controller.abort();
  }, [path]);

  return state;
}

export function queryPath(path: string, values: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
