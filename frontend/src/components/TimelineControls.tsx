import { useMemo } from "react";

import type { TimelineResponse } from "../types";

export function TimelineControls({
  timeline,
  frame,
  playing,
  speed,
  onFrame,
  onPlay,
  onSpeed,
}: {
  timeline: TimelineResponse;
  frame: number;
  playing: boolean;
  speed: number;
  onFrame: (frame: number) => void;
  onPlay: () => void;
  onSpeed: (speed: number) => void;
}) {
  const markerByLabel = useMemo(() => Object.fromEntries(timeline.markers.map((marker) => [marker.label, marker])), [timeline.markers]);
  const nearestFrame = (candidate: number) => timeline.available_frames.reduce(
    (closest, available) => Math.abs(available - candidate) < Math.abs(closest - candidate) ? available : closest,
    timeline.available_frames[0],
  );
  const step = (amount: number) => {
    const index = Math.max(0, timeline.available_frames.indexOf(frame));
    onFrame(timeline.available_frames[Math.max(0, Math.min(timeline.available_frames.length - 1, index + amount))]);
  };
  const jump = (label: string) => {
    const target = markerByLabel[label];
    if (target?.available && target.frame !== null) onFrame(target.frame);
  };
  return (
    <section className="timeline" aria-label="Tracking timeline controls">
      <div className="timeline__topline">
        <div className="timeline__frame">
          <span>Tracking</span>
          <strong>Frame {frame} <span>{frame - timeline.provider_pass_frame >= 0 ? "+" : ""}{frame - timeline.provider_pass_frame}</span></strong>
        </div>
        <div className="timeline__controls">
          <button type="button" className="icon-button" onClick={() => step(-5)} aria-label="Previous five frames">−5</button>
          <button type="button" className="icon-button" onClick={() => step(-1)} aria-label="Previous frame">−1</button>
          <button type="button" className="button button--primary" onClick={onPlay}>{playing ? "Pause" : "Play"}</button>
          <button type="button" className="icon-button" onClick={() => step(1)} aria-label="Next frame">+1</button>
          <button type="button" className="icon-button" onClick={() => step(5)} aria-label="Next five frames">+5</button>
          <button type="button" className="button button--secondary" onClick={() => jump("Actual pass frame")}>Pass</button>
        </div>
        <label className="compact-label">
          Playback
          <select value={speed} onChange={(event) => onSpeed(Number(event.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
      </div>
      <input aria-label="Displayed tracking frame" type="range" min={timeline.window_start} max={timeline.window_end} value={frame} onChange={(event) => onFrame(nearestFrame(Number(event.target.value)))} />
      <p className="timeline__hint sr-only">Keyboard: ←/→ step, Shift+←/→ step five, Space play/pause, P actual pass frame.</p>
    </section>
  );
}
