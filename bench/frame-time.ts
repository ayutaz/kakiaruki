import { createSineCommandSource } from "../src/domain/control/joint-command-source.ts";
import { validateCreatureGraph } from "../src/domain/creature/creature-graph-validation.ts";
import type { CreatureGraph } from "../src/domain/creature/creature-graph.ts";
import { createCreature } from "../src/simulation/box2d/box2d-creature-factory.ts";
import {
  createPhysicsWorld,
  type PhysicsWorld
} from "../src/simulation/box2d/box2d-world.ts";
import { DEFAULT_EPISODE_OPTIONS } from "../src/simulation/episode-tracker.ts";
import { FixedStepRunner } from "../src/simulation/fixed-step-runner.ts";
import { planLanes } from "../src/simulation/lane-allocator.ts";
import { PopulationRunner } from "../src/simulation/population-runner.ts";
import type { CreatureHandle } from "../src/simulation/ports/creature-port.ts";
import {
  buildSkeletonPlan,
  computeSpawnOffset,
  skeletonWidth,
  type SkeletonPlan
} from "../src/simulation/skeleton-plan.ts";

const RADIUS = 0.11;
const STEP_SECONDS = DEFAULT_EPISODE_OPTIONS.stepSeconds;
const PIXELS_PER_METER = 60;

const zigzag6: CreatureGraph = {
  rootNodeId: "n0",
  nodes: (
    [
      [0, 0],
      [0.6, 0.5],
      [1.2, 0],
      [1.8, 0.5],
      [2.4, 0],
      [3, 0.5],
      [3.6, 0]
    ] as const
  ).map(([x, y], index) => ({ id: `n${index}`, position: { x, y } })),
  edges: Array.from({ length: 6 }, (_unused, index) => ({
    id: `e${index}`,
    nodeA: `n${index}`,
    nodeB: `n${index + 1}`,
    radius: RADIUS
  }))
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`missing element #${id}`);
  }
  return found as T;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index]!;
}

interface Session {
  readonly world: PhysicsWorld;
  readonly creatures: readonly CreatureHandle[];
  readonly runner: PopulationRunner;
}

class FrameTimeBenchmark {
  readonly #plan: SkeletonPlan;
  readonly #canvas = element<HTMLCanvasElement>("view");
  readonly #context: CanvasRenderingContext2D;
  readonly #stepRunner = new FixedStepRunner({
    stepSeconds: STEP_SECONDS,
    maxStepsPerFrame: 240
  });
  #session: Session | null = null;
  #frameTimes: number[] = [];
  #physicsSteps = 0;
  #measuredSeconds = 0;
  #lastFrameStamp = 0;
  #running = false;

  constructor(plan: SkeletonPlan) {
    this.#plan = plan;
    const context = this.#canvas.getContext("2d");
    if (!context) {
      throw new Error("2d canvas context is unavailable");
    }
    this.#context = context;
  }

  get populationSize(): number {
    return Number(element<HTMLSelectElement>("population").value);
  }

  get renderCount(): number {
    return Number(element<HTMLSelectElement>("rendered").value);
  }

  get speedMultiplier(): number {
    return Number(element<HTMLSelectElement>("speed").value);
  }

  start(): void {
    this.reset();
    this.#running = true;
    this.#lastFrameStamp = performance.now();
    requestAnimationFrame((stamp) => this.#frame(stamp));
  }

  stop(): void {
    this.#running = false;
  }

  reset(): void {
    this.#session?.world.destroy();
    this.#frameTimes = [];
    this.#physicsSteps = 0;
    this.#measuredSeconds = 0;
    this.#stepRunner.reset();

    const world = createPhysicsWorld();
    const clearance = computeSpawnOffset(this.#plan, 0.1);
    const creatures = planLanes(this.populationSize, skeletonWidth(this.#plan)).map((lane) =>
      createCreature(world, this.#plan, {
        origin: { x: clearance.x + lane.origin.x, y: clearance.y + lane.origin.y },
        groupIndex: lane.groupIndex
      })
    );
    const runner = new PopulationRunner({
      world,
      creatures,
      members: creatures.map((creature, index) => ({
        commands: createSineCommandSource({
          globalFrequency: 1.4,
          joints: Array.from({ length: creature.jointCount }, (_unused, jointIndex) => ({
            amplitude: 0.6,
            phase: index * 0.3 + (jointIndex * Math.PI) / 3,
            bias: 0
          })),
          proportionalGain: 12,
          derivativeGain: 0.5,
          maxMotorSpeed: 9
        })
      })),
      // frame time計測なので、episodeが終わらないよう十分長くする。
      options: { durationSeconds: 3600 }
    });
    this.#session = { world, creatures, runner };
    this.#render();
    this.#report();
  }

  #frame(stamp: number): void {
    if (!this.#running || !this.#session) {
      return;
    }
    const frameMilliseconds = stamp - this.#lastFrameStamp;
    this.#lastFrameStamp = stamp;
    if (frameMilliseconds > 0 && frameMilliseconds < 1000) {
      this.#frameTimes.push(frameMilliseconds);
      this.#measuredSeconds += frameMilliseconds / 1000;
    }

    const elapsedSeconds = Math.min(frameMilliseconds / 1000, 0.25) * this.speedMultiplier;
    const runner = this.#session.runner;
    this.#stepRunner.advance(elapsedSeconds, () => {
      runner.step();
      this.#physicsSteps += 1;
    });

    this.#render();
    this.#report();
    requestAnimationFrame((next) => this.#frame(next));
  }

  #render(): void {
    const session = this.#session;
    const context = this.#context;
    context.fillStyle = "#07131f";
    context.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
    if (!session) {
      return;
    }

    const indexes = Array.from({ length: this.renderCount }, (_unused, index) => index).filter(
      (index) => index < session.creatures.length
    );
    if (indexes.length === 0) {
      return;
    }

    const snapshots = session.runner.snapshots(indexes);
    const groundY = this.#canvas.height - 60;
    context.strokeStyle = "#19364d";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, groundY);
    context.lineTo(this.#canvas.width, groundY);
    context.stroke();

    const laneWidth = this.#canvas.width / indexes.length;
    for (const [slot, snapshot] of snapshots.entries()) {
      const centerX = laneWidth * (slot + 0.5);
      context.strokeStyle = "#ffd166";
      context.lineCap = "round";
      for (const bone of snapshot.bones) {
        const half = bone.length / 2;
        const dx = Math.cos(bone.angle) * half * PIXELS_PER_METER;
        const dy = Math.sin(bone.angle) * half * PIXELS_PER_METER;
        const x = centerX + (bone.x - snapshot.centerOfMass.x) * PIXELS_PER_METER;
        const y = groundY - bone.y * PIXELS_PER_METER;
        context.lineWidth = bone.radius * 2 * PIXELS_PER_METER;
        context.beginPath();
        context.moveTo(x - dx, y + dy);
        context.lineTo(x + dx, y - dy);
        context.stroke();
      }
    }
  }

  #report(): void {
    const sorted = [...this.#frameTimes].sort((left, right) => left - right);
    const stepsPerSecond =
      this.#measuredSeconds > 0 ? this.#physicsSteps / this.#measuredSeconds : 0;
    element("frames").textContent = String(sorted.length);
    element("p50").textContent = `${percentile(sorted, 0.5).toFixed(2)} ms`;
    element("p95").textContent = `${percentile(sorted, 0.95).toFixed(2)} ms`;
    element("p99").textContent = `${percentile(sorted, 0.99).toFixed(2)} ms`;
    element("worst").textContent = `${(sorted.at(-1) ?? 0).toFixed(2)} ms`;
    element("steps").textContent = stepsPerSecond.toFixed(0);
    element("creature-steps").textContent = (
      stepsPerSecond * (this.#session?.creatures.length ?? 0)
    ).toFixed(0);
    element("summary").textContent = JSON.stringify({
      population: this.populationSize,
      rendered: this.renderCount,
      speed: this.speedMultiplier,
      frames: sorted.length,
      p50: Number(percentile(sorted, 0.5).toFixed(2)),
      p95: Number(percentile(sorted, 0.95).toFixed(2)),
      p99: Number(percentile(sorted, 0.99).toFixed(2)),
      physicsStepsPerSecond: Number(stepsPerSecond.toFixed(0))
    });
  }
}

const validated = validateCreatureGraph(zigzag6);
if (!validated.ok) {
  throw new Error(`benchmark fixture is invalid: ${JSON.stringify(validated.errors)}`);
}
const benchmark = new FrameTimeBenchmark(buildSkeletonPlan(validated.graph));

element<HTMLButtonElement>("start").addEventListener("click", () => benchmark.start());
element<HTMLButtonElement>("stop").addEventListener("click", () => benchmark.stop());
for (const id of ["population", "rendered", "speed"]) {
  element<HTMLSelectElement>(id).addEventListener("change", () => benchmark.start());
}
benchmark.reset();
