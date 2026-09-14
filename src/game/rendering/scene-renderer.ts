import type { StrokePreview } from "../../domain/stroke/stroke-graph-builder.ts";
import type { StrokePoint } from "../../domain/stroke/stroke-point.ts";
import type { CreatureSnapshot } from "../../simulation/ports/creature-port.ts";

/**
 * Canvas 2D への描画だけを行うadapter。判断は持たない。
 * 物理も進化も知らず、渡された状態をそのまま映す。
 */

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface StrokeSceneInput {
  readonly size: CanvasSize;
  /** 描いている途中の生の点列。 */
  readonly rawPoints: readonly StrokePoint[];
  /** 変換できた骨格。まだ無ければ null。 */
  readonly preview: StrokePreview | null;
  /** ワールド短辺に対応させる長さ [m]。preview の座標系。 */
  readonly worldShortSide: number;
  readonly accepted: boolean;
}

export interface ObservationLane {
  readonly label: string;
  readonly color: string;
  readonly startX: number;
  readonly snapshot: CreatureSnapshot | null;
}

export interface ObservationSceneInput {
  readonly size: CanvasSize;
  readonly lanes: readonly ObservationLane[];
  readonly pixelsPerMeter: number;
  /** 骨格幅 [m]。距離の目盛りを体長で示すために使う。 */
  readonly bodyLength: number;
}

const BACKGROUND = "#07131f";
const GRID = "#132a3c";
const BONE = "#ffd166";
const NODE = "#f5f9ff";
const REJECTED = "#e76f51";
const DRAWN = "#2f5d7f";

function clear(context: CanvasRenderingContext2D, size: CanvasSize): void {
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, size.width, size.height);
}

function drawGrid(context: CanvasRenderingContext2D, size: CanvasSize, step: number): void {
  context.strokeStyle = GRID;
  context.lineWidth = 1;
  for (let x = 0; x <= size.width; x += step) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, size.height);
    context.stroke();
  }
  for (let y = 0; y <= size.height; y += step) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(size.width, y + 0.5);
    context.stroke();
  }
}

/** 描く画面。生の線と、変換できた骨格を重ねて出す。 */
export function drawStrokeScene(
  context: CanvasRenderingContext2D,
  input: StrokeSceneInput
): void {
  const { size } = input;
  clear(context, size);
  drawGrid(context, size, 40);

  if (input.rawPoints.length > 1) {
    context.strokeStyle = input.accepted ? DRAWN : REJECTED;
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(input.rawPoints[0]!.x, input.rawPoints[0]!.y);
    for (const point of input.rawPoints.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
  }

  const preview = input.preview;
  if (!preview) {
    return;
  }

  const scale = Math.min(size.width, size.height) / input.worldShortSide;
  const toScreen = (point: { x: number; y: number }) => ({
    x: size.width / 2 + point.x * scale,
    y: size.height / 2 - point.y * scale
  });

  context.strokeStyle = BONE;
  context.lineWidth = 7;
  context.lineCap = "round";
  for (const edge of preview.edges) {
    const a = toScreen(edge.a);
    const b = toScreen(edge.b);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  for (const node of preview.nodes) {
    const point = toScreen(node.position);
    context.fillStyle = NODE;
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
  }
}

/** 観察画面。同じ位置から走り出した個体が、どこまで進んだかを見せる。 */
export function drawObservationScene(
  context: CanvasRenderingContext2D,
  input: ObservationSceneInput
): void {
  const { size, pixelsPerMeter } = input;
  clear(context, size);

  const groundY = size.height - 56;
  const originX = 96;

  // 1体長ごとの目盛り。
  context.strokeStyle = GRID;
  context.lineWidth = 1;
  const step = Math.max(1, input.bodyLength) * pixelsPerMeter;
  for (let index = 0; originX + index * step <= size.width; index += 1) {
    const x = Math.round(originX + index * step) + 0.5;
    context.beginPath();
    context.moveTo(x, 24);
    context.lineTo(x, groundY);
    context.stroke();
  }

  context.strokeStyle = "#1d3a52";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, groundY);
  context.lineTo(size.width, groundY);
  context.stroke();

  context.font = "12px system-ui, sans-serif";
  for (const [index, lane] of input.lanes.entries()) {
    const snapshot = lane.snapshot;
    context.fillStyle = lane.color;
    context.fillText(lane.label, 12, 20 + index * 16);
    if (!snapshot) {
      continue;
    }

    context.strokeStyle = lane.color;
    context.lineCap = "round";
    for (const bone of snapshot.bones) {
      const half = bone.length / 2;
      const dx = Math.cos(bone.angle) * half * pixelsPerMeter;
      const dy = Math.sin(bone.angle) * half * pixelsPerMeter;
      const x = originX + (bone.x - lane.startX) * pixelsPerMeter;
      const y = groundY - bone.y * pixelsPerMeter;
      context.lineWidth = Math.max(2, bone.radius * 2 * pixelsPerMeter);
      context.beginPath();
      context.moveTo(x - dx, y + dy);
      context.lineTo(x + dx, y - dy);
      context.stroke();
    }

    const travelled = (snapshot.centerOfMass.x - lane.startX) / Math.max(1e-6, input.bodyLength);
    context.fillStyle = lane.color;
    context.fillText(`${travelled.toFixed(2)} 体長`, 12 + 132, 20 + index * 16);
  }
}
