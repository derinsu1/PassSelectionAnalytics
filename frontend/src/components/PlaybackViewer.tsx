import { useEffect, useMemo, useState } from "react";

import { formatNumber, humanize } from "../format";
import type { DecisionDetails, PlaybackBundle, ReceiverOption } from "../types";
import { Definition } from "./Common";
import { PlaybackCanvas, type PitchToggles } from "./PlaybackCanvas";
import { TimelineControls } from "./TimelineControls";

export function PlaybackViewer({
  bundle,
  detail,
  toggles,
  setToggles,
  activeOptionId,
  onSelectOption,
  pitchView,
  setPitchView,
  jumpRequest,
}: {
  bundle: PlaybackBundle;
  detail: DecisionDetails;
  toggles: PitchToggles;
  setToggles: (updater: (current: PitchToggles) => PitchToggles) => void;
  activeOptionId: string | null;
  onSelectOption: (option: ReceiverOption) => void;
  pitchView: "action" | "full";
  setPitchView: (view: "action" | "full") => void;
  jumpRequest: { frame: number; sequence: number } | null;
}) {
  const timeline = bundle.timeline;
  const frameNumbers = timeline.available_frames;
  const [currentFrame, setCurrentFrame] = useState(timeline.provider_pass_frame);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const frameByNumber = useMemo(
    () => new Map(bundle.frames.map((frame) => [frame.frame_number, frame])),
    [bundle.frames],
  );
  const activeFrame = frameByNumber.get(currentFrame) ?? bundle.frames[0];
  const inspectedOption = activeOptionId ? detail.options.find((option) => option.option_id === activeOptionId) ?? null : null;
  const inspectedPlayer = inspectedOption ? activeFrame?.players.find((player) => player.player_id === inspectedOption.receiver_id) ?? null : null;
  const inspectedDistance = inspectedOption && !inspectedOption.is_selected && inspectedPlayer && activeFrame?.ball.x !== null && activeFrame?.ball.y !== null && inspectedPlayer.x !== null && inspectedPlayer.y !== null
    ? Math.hypot(activeFrame.ball.x - inspectedPlayer.x, activeFrame.ball.y - inspectedPlayer.y)
    : null;
  const framePhase = activeFrame?.frame_offset_from_pass === 0 ? "At actual pass" : (activeFrame?.frame_offset_from_pass ?? 0) < 0 ? "Before pass" : "After pass";

  useEffect(() => {
    setCurrentFrame(timeline.provider_pass_frame);
    setPlaying(false);
  }, [timeline.decision_id, timeline.window_start, timeline.window_end, timeline.provider_pass_frame]);

  useEffect(() => {
    if (!jumpRequest || !frameByNumber.has(jumpRequest.frame)) return;
    setPlaying(false);
    setCurrentFrame(jumpRequest.frame);
  }, [frameByNumber, jumpRequest]);

  useEffect(() => {
    if (!playing) return;
    const startIndex = Math.max(0, frameNumbers.indexOf(currentFrame));
    const startedAt = window.performance.now();
    let requestId = 0;
    const animate = (now: number) => {
      const frameOffset = Math.floor((now - startedAt) * speed / 100);
      const index = Math.min(frameNumbers.length - 1, startIndex + frameOffset);
      setCurrentFrame(frameNumbers[index]);
      if (index >= frameNumbers.length - 1) {
        setPlaying(false);
        return;
      }
      requestId = window.requestAnimationFrame(animate);
    };
    requestId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(requestId);
  }, [frameNumbers, playing, speed]);

  const chooseFrame = (frame: number) => {
    if (!frameByNumber.has(frame)) return;
    setPlaying(false);
    setCurrentFrame(frame);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, summary")) return;
      const currentIndex = Math.max(0, frameNumbers.indexOf(currentFrame));
      const move = (amount: number) => chooseFrame(frameNumbers[Math.max(0, Math.min(frameNumbers.length - 1, currentIndex + amount))]);
      if (event.key === "ArrowLeft") { event.preventDefault(); move(event.shiftKey ? -5 : -1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(event.shiftKey ? 5 : 1); }
      if (event.key === " ") { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key.toLowerCase() === "p") chooseFrame(timeline.provider_pass_frame);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentFrame, frameNumbers, timeline]);

  if (!activeFrame) return null;
  return (
    <>
      <section className="pitch-panel panel">
        <div className="panel-heading pitch-panel__heading"><div><p className="eyebrow">Pitch playback</p><h2>Tracking frame {currentFrame}</h2></div><div className="frame-status" aria-label={`Frame status: ${framePhase}`}><span>{framePhase}</span><code>{currentFrame - timeline.provider_pass_frame >= 0 ? "+" : ""}{currentFrame - timeline.provider_pass_frame} frames</code></div></div>
        <div className="pitch-toolbar">
          <div className="pitch-toolbar__controls">
            <div className="pitch-view-toggle" role="group" aria-label="Pitch view">
              <span>View</span>
              <button type="button" className={pitchView === "full" ? "is-current" : ""} aria-pressed={pitchView === "full"} onClick={() => setPitchView("full")}>Full pitch</button>
              <button type="button" className={pitchView === "action" ? "is-current" : ""} aria-pressed={pitchView === "action"} onClick={() => setPitchView("action")}>Action focus</button>
            </div>
            <details className="pitch-overlays" aria-label="Pitch overlays">
              <summary>Overlays</summary>
              <fieldset className="toggle-grid"><legend className="sr-only">Pitch overlays</legend>{Object.entries(toggles).map(([key, enabled]) => <label key={key}><input type="checkbox" checked={enabled} onChange={(event) => setToggles((current) => ({ ...current, [key]: event.target.checked }))} />{humanize(key.replace("show_", ""))}</label>)}</fieldset>
            </details>
          </div>
        </div>
        <TimelineControls timeline={timeline} frame={currentFrame} playing={playing} speed={speed} onFrame={chooseFrame} onPlay={() => setPlaying((value) => !value)} onSpeed={setSpeed} />
        <div className="pitch-stage"><div className="pitch-stage__hud" aria-hidden="true"><span>ACTUAL-FRAME REVIEW</span><span>{activeFrame.match_clock ?? "NO CLOCK"}</span></div><PlaybackCanvas decisionId={detail.summary.decision_id} renderContext={bundle.render_context} frame={activeFrame} frames={bundle.frames} options={detail.options} activeOptionId={activeOptionId} onSelectOption={onSelectOption} toggles={toggles} viewMode={pitchView} /></div>
        <div className="pitch-legend" role="list" aria-label="Pitch legend">
          <span role="listitem"><i className="legend-dot legend-dot--attacking" aria-hidden="true" />Attacking team</span>
          <span role="listitem"><i className="legend-dot legend-dot--defending" aria-hidden="true" />Defending team</span>
          <span role="listitem"><i className="legend-dot legend-dot--passer" aria-hidden="true" />Passer</span>
          <span role="listitem"><i className="legend-dot legend-dot--selected" aria-hidden="true" />Selected option</span>
          <span role="listitem"><i className="legend-dot legend-dot--best" aria-hidden="true" />Highest PVI</span>
          <span role="listitem"><i className="legend-dot legend-dot--active" aria-hidden="true" />Inspected teammate</span>
          <span role="listitem"><i className="legend-dot legend-dot--ball" aria-hidden="true" />Ball</span>
          <span role="listitem"><i className="legend-line legend-line--selected" aria-hidden="true" />Selected pass</span>
          <span role="listitem"><i className="legend-line legend-line--best" aria-hidden="true" />Highest PVI</span>
          {toggles.show_player_movement ? <span role="listitem"><i className="legend-line legend-line--motion" aria-hidden="true" />Derived player movement</span> : null}
        </div>
      </section>
      <section className="frame-readout panel"><div className="panel-heading"><div><p className="eyebrow">Frame context</p><h2>{activeFrame.match_clock ?? "Unavailable"}</h2></div><span className="panel-note">{framePhase}</span></div><dl className="definition-grid"><Definition term="Ball-to-passer distance">{formatNumber(activeFrame.ball_to_passer_distance, 2)} m</Definition><Definition term="Ball-to-selected-receiver distance">{formatNumber(activeFrame.ball_to_selected_receiver_distance, 2)} m</Definition>{inspectedDistance !== null ? <Definition term="Ball-to-inspected-receiver distance">{formatNumber(inspectedDistance, 2)} m</Definition> : null}</dl></section>
    </>
  );
}
