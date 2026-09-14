import type { StrokePoint, ViewportSize } from "../../src/domain/stroke/stroke-point.ts";

export const STROKE_VIEWPORT: ViewportSize = { width: 640, height: 480 };

export type ScreenPath = readonly (readonly [number, number])[];

/**
 * 折れ線を `stepPx` 間隔でサンプリングして生のPointer点列を作る。
 * `stepPx` を変えると、同じ軌跡のまま入力イベント密度だけが変わる。
 */
export function sampleStroke(
  path: ScreenPath,
  stepPx: number,
  msPerPoint = 8
): readonly StrokePoint[] {
  if (path.length < 2) {
    throw new RangeError("path needs at least two corners");
  }
  if (!Number.isFinite(stepPx) || stepPx <= 0) {
    throw new RangeError("stepPx must be finite and greater than zero");
  }

  const points: StrokePoint[] = [];
  let time = 0;
  const push = (x: number, y: number): void => {
    points.push({ x, y, time });
    time += msPerPoint;
  };

  const [firstX, firstY] = path[0]!;
  push(firstX, firstY);

  for (let index = 1; index < path.length; index += 1) {
    const [ax, ay] = path[index - 1]!;
    const [bx, by] = path[index]!;
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.round(length / stepPx));
    for (let step = 1; step <= steps; step += 1) {
      push(ax + ((bx - ax) * step) / steps, ay + ((by - ay) * step) / steps);
    }
  }
  return points;
}

export const STRAIGHT_PATH: ScreenPath = [
  [120, 240],
  [520, 240]
];

export const L_SHAPE_PATH: ScreenPath = [
  [140, 120],
  [430, 120],
  [430, 390]
];

export const ZIGZAG_PATH: ScreenPath = [
  [110, 300],
  [210, 180],
  [310, 300],
  [410, 180],
  [510, 300]
];

/** 折れ曲がり閾値を超えない緩い弧。cornerが出ないことの検証に使う。 */
export const CURVE_PATH: ScreenPath = Array.from({ length: 24 }, (_unused, index) => {
  const angle = Math.PI * (0.15 + (0.7 * index) / 23);
  return [320 + Math.cos(angle) * 200, 330 - Math.sin(angle) * 120] as const;
});

/** 自分自身を横切る線。M4では拒否する。 */
export const SELF_INTERSECTING_PATH: ScreenPath = [
  [200, 160],
  [440, 360],
  [440, 160],
  [200, 360]
];

/** 始点付近へ戻る閉路候補。M4では拒否する。 */
export const CLOSED_LOOP_PATH: ScreenPath = [
  [240, 160],
  [420, 160],
  [420, 330],
  [240, 330],
  [242, 166]
];

export const straightStroke = (stepPx = 12): readonly StrokePoint[] =>
  sampleStroke(STRAIGHT_PATH, stepPx);
export const lShapeStroke = (stepPx = 12): readonly StrokePoint[] =>
  sampleStroke(L_SHAPE_PATH, stepPx);
export const zigzagStroke = (stepPx = 12): readonly StrokePoint[] =>
  sampleStroke(ZIGZAG_PATH, stepPx);
export const curveStroke = (stepPx = 12): readonly StrokePoint[] =>
  sampleStroke(CURVE_PATH, stepPx);
export const selfIntersectingStroke = (stepPx = 12): readonly StrokePoint[] =>
  sampleStroke(SELF_INTERSECTING_PATH, stepPx);
export const closedLoopStroke = (stepPx = 12): readonly StrokePoint[] =>
  sampleStroke(CLOSED_LOOP_PATH, stepPx);

/**
 * 振幅の浅い波線。人が普通に描く「ゆるい波」に近い。
 * 交差していないのに、まっすぐな部分の外積が丸め誤差で符号違いに見えることがある。
 */
export const SHALLOW_WAVE_PATH: ScreenPath = [
  [120, 250],
  [200, 200],
  [280, 250],
  [360, 200],
  [440, 250],
  [520, 210]
];

export const shallowWaveStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(SHALLOW_WAVE_PATH, stepPx);

/** キャンバスいっぱいに描いた大きな波。骨14本になり、本数上限ちょうどに届く。 */
export const BIG_WAVE_PATH: ScreenPath = [
  [40, 380],
  [190, 90],
  [350, 380],
  [600, 120],
  [620, 300]
];

export const bigWaveStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(BIG_WAVE_PATH, stepPx);

/** 終端に最小骨長未満の短い突起がある線。短Edge統合が効かないと拒否される。 */
export const STUB_TAIL_PATH: ScreenPath = [
  [140, 200],
  [430, 200],
  [430, 184]
];

export const stubTailStroke = (stepPx = 8): readonly StrokePoint[] =>
  sampleStroke(STUB_TAIL_PATH, stepPx);

/** Y字。縦棒を上へ描き、途中まで戻ってから右上へ伸ばす。 */
export const Y_BRANCH_PATH: ScreenPath = [
  [320, 400],
  [320, 160],
  [320, 250],
  [470, 150]
];

export const yBranchStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(Y_BRANCH_PATH, stepPx);

/**
 * 折り返して並走するだけの線。往路との間隔は40 px（約0.5 m）で、
 * 戻りとみなす距離（0.22 m）より離れている。
 */
export const NEAR_MISS_PATH: ScreenPath = [
  [120, 360],
  [420, 360],
  [420, 320],
  [140, 320]
];

export const nearMissStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(NEAR_MISS_PATH, stepPx);

/**
 * 20度ほどの鋭いV字。頂点の近くだけ往路と重なるが、重なる長さが短いので
 * 戻り線ではなく折れ曲がりとして扱う。
 */
export const HAIRPIN_PATH: ScreenPath = [
  [277, 400],
  [320, 150],
  [363, 400]
];

export const hairpinStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(HAIRPIN_PATH, stepPx);

/**
 * 内側へ巻き込む線。最後の区間が最初の区間と15 px（約0.19 m）しか離れていないが、
 * 進行方向は同じなので戻り線ではない。
 */
export const INWARD_SPIRAL_PATH: ScreenPath = [
  [120, 300],
  [420, 300],
  [420, 240],
  [140, 240],
  [140, 285],
  [400, 285]
];

export const inwardSpiralStroke = (stepPx = 6): readonly StrokePoint[] =>
  sampleStroke(INWARD_SPIRAL_PATH, stepPx);

/**
 * 人型相当。胴を下から上へ描き、肩まで戻って左腕、肩へ戻って右腕を伸ばす。
 * 分岐点が1つ、葉が3つになる。
 */
export const HUMANOID_PATH: ScreenPath = [
  [320, 400],
  [320, 140],
  [320, 210],
  [200, 150],
  [320, 210],
  [440, 150]
];

export const humanoidStroke = (stepPx = 5): readonly StrokePoint[] =>
  sampleStroke(HUMANOID_PATH, stepPx);

/** 短すぎる線。骨1本にも足りない。 */
export const tooShortStroke = (): readonly StrokePoint[] =>
  sampleStroke(
    [
      [300, 240],
      [312, 240]
    ],
    4
  );

/** 同じ点を打ち続けた入力。 */
export const repeatedPointStroke = (): readonly StrokePoint[] =>
  Array.from({ length: 40 }, (_unused, index) => ({ x: 300, y: 240, time: index * 8 }));

export const validStrokeFixtures: readonly {
  name: string;
  path: ScreenPath;
  expectedEdges: number;
}[] = [
  { name: "straight", path: STRAIGHT_PATH, expectedEdges: 1 },
  { name: "lShape", path: L_SHAPE_PATH, expectedEdges: 2 },
  { name: "zigzag", path: ZIGZAG_PATH, expectedEdges: 4 }
];
