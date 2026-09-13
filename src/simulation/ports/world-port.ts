/** 固定stepで進められる物理世界。EpisodeRunnerはこれ以上を要求しない。 */
export interface SteppableWorld {
  step(stepSeconds: number, subSteps: number): void;
}

/** cleanup漏れの検証に使う。Worldに残っているshape数を返す。 */
export interface ShapeCountingWorld extends SteppableWorld {
  countShapes(): number;
}
