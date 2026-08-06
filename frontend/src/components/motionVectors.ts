import type { FramePayload, TrackedObject } from "../types";

interface Point {
  x: number;
  y: number;
}

export interface ScreenMotionVector {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isDetected?: boolean | null;
}

function point(object: TrackedObject | null | undefined): Point | null {
  return object?.x === null || object?.x === undefined || object.y === null || object.y === undefined
    ? null
    : { x: object.x, y: object.y };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

/**
 * Match the project’s metric-side robust movement convention for a frame that
 * is already in the playback bundle. This is movement direction, never pose
 * or body-facing direction.
 */
export function velocityAtFrame(
  frames: FramePayload[],
  frameNumber: number,
  playerId: number | null,
): { vx: number; vy: number } {
  if (playerId === null) return { vx: 0, vy: 0 };
  const history = frames
    .filter((frame) => frame.frame_number >= frameNumber - 5 && frame.frame_number <= frameNumber)
    .sort((left, right) => left.frame_number - right.frame_number);
  const samples: Array<{ vx: number; vy: number }> = [];
  for (let index = 1; index < history.length; index += 1) {
    const previousFrame = history[index - 1];
    const currentFrame = history[index];
    if (currentFrame.frame_number - previousFrame.frame_number !== 1) continue;
    const previous = point(previousFrame.players.find((player) => player.player_id === playerId));
    const current = point(currentFrame.players.find((player) => player.player_id === playerId));
    if (!previous || !current) continue;
    const vx = (current.x - previous.x) * 10;
    const vy = (current.y - previous.y) * 10;
    if (Math.hypot(vx, vy) <= 12) samples.push({ vx, vy });
  }
  return { vx: median(samples.map((sample) => sample.vx)), vy: median(samples.map((sample) => sample.vy)) };
}

export function drawMovingPlayer(
  context: CanvasRenderingContext2D,
  vector: ScreenMotionVector,
  radius = 6.4,
) {
  const speed = Math.hypot(vector.vx, vector.vy);

  context.save();
  context.globalAlpha = 0.94;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.fillStyle = vector.color;
  context.strokeStyle = "#09251e";
  context.lineWidth = 0.9;
  if (speed < 0.35) {
    context.beginPath();
    context.arc(vector.x, vector.y, radius, 0, Math.PI * 2);
  } else {
    const unit = { x: vector.vx / speed, y: -vector.vy / speed };
    const normal = { x: -unit.y, y: unit.x };
    const speedRatio = Math.min(speed, 9) / 9;
    const direction = Math.atan2(unit.y, unit.x);
    const joinAngle = 0.42 + speedRatio * 0.24;
    const tailLength = 2.25 + speedRatio * 6.5;
    const tip = { x: vector.x + unit.x * (radius + tailLength), y: vector.y + unit.y * (radius + tailLength) };
    const lower = { x: vector.x + Math.cos(direction - joinAngle) * radius, y: vector.y + Math.sin(direction - joinAngle) * radius };
    const upper = { x: vector.x + Math.cos(direction + joinAngle) * radius, y: vector.y + Math.sin(direction + joinAngle) * radius };
    const curveWidth = 1.35 + speedRatio * 1.65;
    context.beginPath();
    context.moveTo(lower.x, lower.y);
    context.bezierCurveTo(
      lower.x + unit.x * tailLength * 0.5 + normal.x * curveWidth,
      lower.y + unit.y * tailLength * 0.5 + normal.y * curveWidth,
      tip.x - unit.x * tailLength * 0.18 + normal.x * curveWidth * 0.45,
      tip.y - unit.y * tailLength * 0.18 + normal.y * curveWidth * 0.45,
      tip.x,
      tip.y,
    );
    context.bezierCurveTo(
      tip.x - unit.x * tailLength * 0.18 - normal.x * curveWidth * 0.45,
      tip.y - unit.y * tailLength * 0.18 - normal.y * curveWidth * 0.45,
      upper.x + unit.x * tailLength * 0.5 - normal.x * curveWidth,
      upper.y + unit.y * tailLength * 0.5 - normal.y * curveWidth,
      upper.x,
      upper.y,
    );
    context.arc(vector.x, vector.y, radius, direction + joinAngle, direction - joinAngle + Math.PI * 2);
  }
  context.fill();
  context.stroke();
  context.restore();
}
