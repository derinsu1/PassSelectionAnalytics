import { useLayoutEffect, useRef, useState } from "react";

import type { FramePayload, PlaybackRenderContext, ReceiverOption, TrackedObject } from "../types";
import { drawMovingPlayer, velocityAtFrame } from "./motionVectors";

export interface PitchToggles {
  show_player_movement: boolean;
  show_player_labels: boolean;
  show_names: boolean;
  show_ids: boolean;
  show_option_labels: boolean;
  show_all_option_arrows: boolean;
  show_highest_pvi_arrow: boolean;
  show_ball_trail: boolean;
  show_defender_labels: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

interface InteractiveOptionTarget {
  option: ReceiverOption;
  x: number;
  y: number;
}

// IFAB Law 1 measurements in metres. Goal net depth is visual only: the Laws
// define the post spacing and crossbar height, not a top-down net depth.
const goalPostSeparation = 7.32;
const goalHalfWidth = goalPostSeparation / 2;
const goalNetDepth = 2;
const penaltyMarkDistance = 11;
const outerPitchPadding = 3;

function point(object: TrackedObject | null | undefined): Point | null {
  return object?.x === null || object?.x === undefined || object.y === null || object.y === undefined
    ? null
    : { x: object.x, y: object.y };
}

function drawCircle(context: CanvasRenderingContext2D, at: Point, radius: number, fill: string, stroke = "#09251e", lineWidth = 1) {
  context.beginPath();
  context.arc(at.x, at.y, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawArrow(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  dashed: boolean,
  lineWidth: number,
  alpha = 1,
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const endPadding = 10;
  const target = { x: end.x - Math.cos(angle) * endPadding, y: end.y - Math.sin(angle) * endPadding };
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.setLineDash(dashed ? [7, 5] : []);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(target.x, target.y);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(target.x, target.y);
  context.lineTo(
    target.x - Math.cos(angle - Math.PI / 6) * 9,
    target.y - Math.sin(angle - Math.PI / 6) * 9,
  );
  context.lineTo(
    target.x - Math.cos(angle + Math.PI / 6) * 9,
    target.y - Math.sin(angle + Math.PI / 6) * 9,
  );
  context.closePath();
  context.fill();
  context.restore();
}

function selectedBounds(
  full: Bounds,
  focus: Point[],
  aspect: number,
): Bounds {
  if (!focus.length) return full;
  const minX = Math.min(...focus.map((value) => value.x));
  const maxX = Math.max(...focus.map((value) => value.x));
  const minY = Math.min(...focus.map((value) => value.y));
  const maxY = Math.max(...focus.map((value) => value.y));
  let width = Math.max(30, maxX - minX + 16);
  let height = Math.max(19, maxY - minY + 14);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  width = Math.min(width, full.right - full.left);
  height = Math.min(height, full.top - full.bottom);
  let centerX = (minX + maxX) / 2;
  let centerY = (minY + maxY) / 2;
  centerX = Math.min(Math.max(centerX, full.left + width / 2), full.right - width / 2);
  centerY = Math.min(Math.max(centerY, full.bottom + height / 2), full.top - height / 2);
  return { left: centerX - width / 2, right: centerX + width / 2, bottom: centerY - height / 2, top: centerY + height / 2 };
}

function clampToBounds(value: Point, bounds: Bounds): Point {
  return {
    x: Math.min(Math.max(value.x, bounds.left), bounds.right),
    y: Math.min(Math.max(value.y, bounds.bottom), bounds.top),
  };
}

export function PlaybackCanvas({
  decisionId,
  renderContext,
  frame,
  frames,
  options,
  activeOptionId,
  onSelectOption,
  toggles,
  viewMode,
}: {
  decisionId: string;
  renderContext: PlaybackRenderContext;
  frame: FramePayload;
  frames: FramePayload[];
  options: ReceiverOption[];
  activeOptionId: string | null;
  onSelectOption: (option: ReceiverOption) => void;
  toggles: PitchToggles;
  viewMode: "action" | "full";
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [interactiveTargets, setInteractiveTargets] = useState<InteractiveOptionTarget[]>([]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * devicePixelRatio);
    canvas.height = Math.round(size.height * devicePixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const full: Bounds = {
      left: -renderContext.pitch_length / 2,
      right: renderContext.pitch_length / 2,
      bottom: -renderContext.pitch_width / 2,
      top: renderContext.pitch_width / 2,
    };
    const optionReceiverIds = new Map(options.map((option) => [option.option_id, option.receiver_id]));
    const optionPlayerIds = new Set(options.map((option) => option.receiver_id));
    const activeOption = activeOptionId ? options.find((option) => option.option_id === activeOptionId) : undefined;
    const activeReceiverId = activeOption ? optionReceiverIds.get(activeOption.option_id) : undefined;
    const activePlayer = frame.players.find((player) => player.player_id === activeReceiverId) ?? null;
    const highestPviOption = options.find((option) => option.is_highest_pvi);
    const highestPviPlayer = frame.players.find((player) => player.player_id === highestPviOption?.receiver_id);
    const fullPitchViewport: Bounds = {
      left: full.left - outerPitchPadding,
      right: full.right + outerPitchPadding,
      bottom: full.bottom - outerPitchPadding,
      top: full.top + outerPitchPadding,
    };
    const displayPlayerPoint = (value: Point | null): Point | null => value === null ? null : clampToBounds(value, fullPitchViewport);
    const focus = [
      displayPlayerPoint(point(frame.passer)), displayPlayerPoint(point(frame.selected_receiver)),
      displayPlayerPoint(point(highestPviPlayer)), displayPlayerPoint(point(activePlayer)),
      point(frame.ball),
    ].filter((value): value is Point => value !== null);
    const bounds = viewMode === "action"
      ? selectedBounds(fullPitchViewport, focus, size.width / size.height)
      : fullPitchViewport;
    const margin = 14;
    const drawableWidth = size.width - margin * 2;
    const drawableHeight = size.height - margin * 2;
    const scale = Math.min(drawableWidth / (bounds.right - bounds.left), drawableHeight / (bounds.top - bounds.bottom));
    const offsetX = (size.width - (bounds.right - bounds.left) * scale) / 2;
    const offsetY = (size.height - (bounds.top - bounds.bottom) * scale) / 2;
    const project = (value: Point): Point => ({
      x: offsetX + (value.x - bounds.left) * scale,
      y: size.height - offsetY - (value.y - bounds.bottom) * scale,
    });
    const visible = (value: Point | null) => value !== null && value.x >= bounds.left && value.x <= bounds.right && value.y >= bounds.bottom && value.y <= bounds.top;
    const fieldTopLeft = project({ x: full.left, y: full.top });
    const fieldBottomRight = project({ x: full.right, y: full.bottom });
    const fieldLeft = fieldTopLeft.x;
    const fieldTop = fieldTopLeft.y;
    const fieldWidth = fieldBottomRight.x - fieldTopLeft.x;
    const fieldHeight = fieldBottomRight.y - fieldTopLeft.y;

    context.fillStyle = "#0d2f27";
    context.fillRect(offsetX, offsetY, (bounds.right - bounds.left) * scale, (bounds.top - bounds.bottom) * scale);
    context.fillStyle = "#123d32";
    context.fillRect(fieldLeft, fieldTop, fieldWidth, fieldHeight);
    const stripes = 8;
    for (let index = 0; index < stripes; index += 1) {
      if (index % 2 !== 0) continue;
      context.fillStyle = "#154838";
      context.fillRect(fieldLeft + fieldWidth * index / stripes, fieldTop, fieldWidth / stripes, fieldHeight);
    }
    context.strokeStyle = "#d9efe7";
    context.lineWidth = 1.2;
    context.strokeRect(fieldLeft, fieldTop, fieldWidth, fieldHeight);
    const center = project({ x: 0, y: 0 });
    context.beginPath();
    context.moveTo(center.x, fieldTop);
    context.lineTo(center.x, fieldTop + fieldHeight);
    context.stroke();
    context.beginPath();
    context.arc(center.x, center.y, 9.15 * scale, 0, Math.PI * 2);
    context.stroke();
    drawCircle(context, center, Math.max(1.5, scale * 0.35), "#d9efe7", "#d9efe7", 0);
    const boxDepth = 16.5;
    const boxHalfWidth = 20.16;
    for (const side of [-1, 1]) {
      const start = side < 0 ? full.left : full.right - boxDepth;
      const left = Math.min(start, start + boxDepth);
      const top = project({ x: left, y: boxHalfWidth });
      const bottom = project({ x: left + boxDepth, y: -boxHalfWidth });
      context.strokeRect(top.x, top.y, bottom.x - top.x, bottom.y - top.y);

      const penaltyMark = project({
        x: side < 0 ? full.left + penaltyMarkDistance : full.right - penaltyMarkDistance,
        y: 0,
      });
      drawCircle(context, penaltyMark, Math.max(1.5, scale * 0.35), "#d9efe7", "#d9efe7", 0);

      if (viewMode === "full") {
        const goalLineX = side < 0 ? full.left : full.right;
        const netX = goalLineX + side * goalNetDepth;
        const postTop = project({ x: goalLineX, y: goalHalfWidth });
        const postBottom = project({ x: goalLineX, y: -goalHalfWidth });
        const netTop = project({ x: netX, y: goalHalfWidth });
        const netBottom = project({ x: netX, y: -goalHalfWidth });
        context.beginPath();
        context.moveTo(postTop.x, postTop.y);
        context.lineTo(netTop.x, netTop.y);
        context.lineTo(netBottom.x, netBottom.y);
        context.lineTo(postBottom.x, postBottom.y);
        context.stroke();
        const postRadius = Math.max(1.5, Math.min(2.5, scale * 0.06));
        drawCircle(context, postTop, postRadius, "#f5fff9", "#d9efe7", 0.6);
        drawCircle(context, postBottom, postRadius, "#f5fff9", "#d9efe7", 0.6);
      }
    }

    const passer = displayPlayerPoint(point(frame.passer));
    const selected = displayPlayerPoint(point(frame.selected_receiver));
    const highestPviPlayerAtFrame = highestPviPlayer;
    const highestPvi = displayPlayerPoint(point(highestPviPlayerAtFrame));
    const active = displayPlayerPoint(point(activePlayer));
    const isPassFrame = frame.frame_offset_from_pass === 0;
    if (isPassFrame && passer) {
      const from = project(passer);
      if (selected) drawArrow(context, from, project(selected), "#f7fbf9", false, 2.6);
      if (highestPvi && (!selected || highestPvi.x !== selected.x || highestPvi.y !== selected.y) && toggles.show_highest_pvi_arrow) {
        drawArrow(context, from, project(highestPvi), "#f7c867", true, 2.4);
      }
      if (toggles.show_all_option_arrows) {
        options.forEach((option) => {
          if (!option.same_frame.has_valid_location || option.is_selected || option.same_frame.rank === 1) return;
          const optionPlayer = frame.players.find((player) => player.player_id === option.receiver_id);
          const target = displayPlayerPoint(point(optionPlayer));
          if (!target) return;
          drawArrow(context, from, project(target), "#9abbb0", true, 1, 0.42);
        });
      }
    }
    if (toggles.show_ball_trail) {
      const currentIndex = frames.findIndex((candidate) => candidate.frame_number === frame.frame_number);
      const trail = frames.slice(Math.max(0, currentIndex - 8), currentIndex + 1)
        .map((candidate) => point(candidate.ball))
        .filter((value): value is Point => value !== null && visible(value))
        .map((value) => project(value));
      if (trail.length > 1) {
        context.save();
        context.strokeStyle = "#f9faf9";
        context.lineWidth = 1.25;
        context.globalAlpha = 0.42;
        context.beginPath();
        trail.forEach((value, index) => index === 0 ? context.moveTo(value.x, value.y) : context.lineTo(value.x, value.y));
        context.stroke();
        context.restore();
      }
    }

    frame.players.forEach((player) => {
      const raw = displayPlayerPoint(point(player));
      if (!visible(raw) || !raw) return;
      const color = player.team_id === renderContext.attacking_team_id ? "#82c7b8" : "#df6076";
      if (toggles.show_player_movement) {
        const velocity = velocityAtFrame(frames, frame.frame_number, player.player_id);
        drawMovingPlayer(context, { ...project(raw), ...velocity, color, isDetected: player.is_detected });
      } else drawCircle(context, project(raw), 6.4, color, "#09251e", 1);
    });
    if (passer && visible(passer)) drawCircle(context, project(passer), 9.2, "#82c7b8", "#ff9f43", 3);
    if (selected && visible(selected)) drawCircle(context, project(selected), 9.6, "#82c7b8", "#ffffff", 2.8);
    if (highestPvi && visible(highestPvi) && (!selected || highestPvi.x !== selected.x || highestPvi.y !== selected.y)) {
      const at = project(highestPvi);
      context.beginPath(); context.arc(at.x, at.y, 11, 0, Math.PI * 2);
      context.strokeStyle = "#f7c867"; context.lineWidth = 2.8; context.stroke();
    }
    if (active && visible(active)) {
      const at = project(active);
      context.beginPath(); context.arc(at.x, at.y, 14, 0, Math.PI * 2);
      context.strokeStyle = "#8cdcf0"; context.lineWidth = 2.1; context.stroke();
    }
    const ball = point(frame.ball);
    if (ball && visible(ball)) {
      const at = project(ball);
      drawCircle(context, at, 7.2, "#f9faf7", "#07110f", 2.7);
      drawCircle(context, at, 1.8, "#0f1f1b", "#0f1f1b", 0);
    }
    if (toggles.show_player_labels) {
      const labelled = new Set<number>();
      const label = (text: string, raw: Point | null) => {
        if (!raw || !visible(raw)) return;
        const at = project(raw);
        context.save(); context.font = "600 10px system-ui, sans-serif";
        const width = context.measureText(text).width + 10;
        context.fillStyle = "rgba(7, 17, 15, .64)";
        context.strokeStyle = "rgba(82, 117, 106, .72)"; context.lineWidth = .6;
        context.beginPath(); context.roundRect(at.x - width / 2, at.y - 25, width, 17, 4); context.fill(); context.stroke();
        context.fillStyle = "rgba(245, 255, 249, .94)"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, at.x, at.y - 16.5);
        context.restore();
      };
      if (frame.passer) { label(`Passer · ${frame.passer.name ?? frame.passer.player_id ?? ""}`, passer); if (frame.passer.player_id !== null) labelled.add(frame.passer.player_id); }
      if (frame.selected_receiver) {
        const isAlsoHighest = frame.selected_receiver.player_id === highestPviPlayerAtFrame?.player_id;
        label(`${isAlsoHighest ? "Selected option · Highest PVI" : "Selected option"} · ${frame.selected_receiver.name ?? frame.selected_receiver.player_id ?? ""}`, selected);
        if (frame.selected_receiver.player_id !== null) labelled.add(frame.selected_receiver.player_id);
      }
      if (highestPviPlayerAtFrame && !highestPviPlayerAtFrame.is_selected_receiver) {
        label(`Highest PVI · ${highestPviPlayerAtFrame.name ?? highestPviPlayerAtFrame.player_id ?? ""}`, highestPvi);
        if (highestPviPlayerAtFrame.player_id !== null) labelled.add(highestPviPlayerAtFrame.player_id);
      }
      frame.players.forEach((player) => {
        if (player.player_id === null || labelled.has(player.player_id)) return;
        const isOption = optionPlayerIds.has(player.player_id);
        if (toggles.show_option_labels && isOption) label(`Option · ${player.name ?? player.player_id}`, point(player));
        else if ((toggles.show_names || toggles.show_ids) && (player.team_id === renderContext.attacking_team_id || toggles.show_defender_labels)) {
          const text = [toggles.show_names ? player.name : null, toggles.show_ids ? player.player_id : null].filter((value) => value !== null).join(" · ");
          if (text) label(text, displayPlayerPoint(point(player)));
        }
      });
    }
    setInteractiveTargets(options.flatMap((option) => {
      const player = frame.players.find((candidate) => candidate.player_id === option.receiver_id);
      const raw = displayPlayerPoint(point(player));
      return raw && visible(raw) ? [{ option, ...project(raw) }] : [];
    }));
  }, [activeOptionId, decisionId, frame, frames, options, renderContext, size, toggles, viewMode]);

  return <div ref={stageRef} className="pitch-canvas-wrap">
    <canvas ref={canvasRef} className="pitch-canvas" role="img" aria-label={`Locally rendered pitch state for ${decisionId} at tracking frame ${frame.frame_number}`} />
    <div className="pitch-option-targets" role="group" aria-label="Pass-option pitch controls">
      {interactiveTargets.map((target) => <button
        key={target.option.option_id}
        type="button"
        className="pitch-option-target"
        style={{ left: `${target.x}px`, top: `${target.y}px` }}
        aria-label={`Inspect pass option for ${target.option.receiver_name}`}
        aria-pressed={target.option.option_id === activeOptionId}
        title={`Inspect ${target.option.receiver_name}`}
        onClick={() => onSelectOption(target.option)}
      />)}
    </div>
  </div>;
}
