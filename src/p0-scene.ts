import Phaser from "phaser";

import { createInitialP0ControlState } from "./p0-control-state.ts";
import { FixedStepRunner } from "./simulation/fixed-step-runner.ts";
import { calculateMotorSpeed } from "./simulation/joint-controller.ts";
import {
  createP0PhysicsRig,
  type BodySnapshot,
  type P0PhysicsRig
} from "./simulation/p0-physics-rig.ts";

const STEP_SECONDS = 1 / 60;
const PIXELS_PER_METER = 110;
const WORLD_ORIGIN_X = 360;
const WORLD_ORIGIN_Y = 280;

export class P0Scene extends Phaser.Scene {
  #graphics?: Phaser.GameObjects.Graphics;
  #rig?: P0PhysicsRig;
  #runner = new FixedStepRunner({
    stepSeconds: STEP_SECONDS,
    maxStepsPerFrame: 16
  });
  #motorEnabled = createInitialP0ControlState().motorEnabled;
  #limitEnabled = createInitialP0ControlState().limitEnabled;
  #speedMultiplier = createInitialP0ControlState().speedMultiplier;
  #simulationSeconds = 0;
  #previousJointAngle = 0;
  #lastUiUpdateMilliseconds = 0;

  constructor() {
    super("p0-physics");
  }

  create(): void {
    this.#graphics = this.add.graphics();
    this.#bindControls();
    this.#resetRig();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.#rig?.destroy());
  }

  override update(_time: number, deltaMilliseconds: number): void {
    const rig = this.#rig;
    if (!rig) {
      return;
    }

    const frameSeconds = Math.min(deltaMilliseconds / 1_000, 0.1);
    this.#runner.advance(frameSeconds * this.#speedMultiplier, () => {
      const currentAngle = rig.getJointAngle();
      const angularVelocity = (currentAngle - this.#previousJointAngle) / STEP_SECONDS;
      const targetAngle = 1.1 * Math.sin(this.#simulationSeconds * 2.2);
      const motorSpeed = calculateMotorSpeed({
        targetAngle,
        currentAngle,
        relativeAngularVelocity: angularVelocity,
        proportionalGain: 10,
        derivativeGain: 0.4,
        maxMotorSpeed: 7
      });

      rig.setMotorSpeed(motorSpeed);
      rig.step();
      this.#previousJointAngle = rig.getJointAngle();
      this.#simulationSeconds += STEP_SECONDS;
    });

    this.#draw(rig.snapshot().bodies);
    if (_time - this.#lastUiUpdateMilliseconds >= 80) {
      this.#updateReadout();
      this.#lastUiUpdateMilliseconds = _time;
    }
  }

  #resetRig(): void {
    this.#rig?.destroy();
    this.#rig = createP0PhysicsRig({
      enableMotor: this.#motorEnabled,
      enableLimit: this.#limitEnabled,
      motorSpeed: 0,
      lowerAngle: -0.35,
      upperAngle: 0.35,
      maxMotorTorque: 100
    });
    this.#simulationSeconds = 0;
    this.#previousJointAngle = 0;
    this.#runner.reset();
    this.#updateControlLabels();
    this.#updateReadout();
  }

  #bindControls(): void {
    this.#requiredElement<HTMLButtonElement>("motor-toggle").addEventListener("click", () => {
      this.#motorEnabled = !this.#motorEnabled;
      this.#resetRig();
    });
    this.#requiredElement<HTMLButtonElement>("limit-toggle").addEventListener("click", () => {
      this.#limitEnabled = !this.#limitEnabled;
      this.#resetRig();
    });
    this.#requiredElement<HTMLSelectElement>("speed").addEventListener("change", (event) => {
      const value = Number((event.currentTarget as HTMLSelectElement).value);
      this.#speedMultiplier = value;
      this.#updateReadout();
    });
    this.#requiredElement<HTMLButtonElement>("reset").addEventListener("click", () => {
      const initialState = createInitialP0ControlState();
      this.#motorEnabled = initialState.motorEnabled;
      this.#limitEnabled = initialState.limitEnabled;
      this.#speedMultiplier = initialState.speedMultiplier;
      this.#resetRig();
    });
  }

  #updateControlLabels(): void {
    const motorButton = this.#requiredElement<HTMLButtonElement>("motor-toggle");
    motorButton.textContent = `モーター: ${this.#motorEnabled ? "ON" : "OFF"}`;
    motorButton.setAttribute("aria-pressed", String(this.#motorEnabled));

    const limitButton = this.#requiredElement<HTMLButtonElement>("limit-toggle");
    limitButton.textContent = `角度制限: ${this.#limitEnabled ? "ON" : "OFF"}`;
    limitButton.setAttribute("aria-pressed", String(this.#limitEnabled));

    this.#requiredElement<HTMLSelectElement>("speed").value = String(this.#speedMultiplier);
  }

  #updateReadout(): void {
    const angle = this.#rig?.getJointAngle() ?? 0;
    const target = 1.1 * Math.sin(this.#simulationSeconds * 2.2);
    this.#requiredElement("status").textContent =
      `${this.#motorEnabled ? "駆動中" : "停止"} · ` +
      `${this.#limitEnabled ? "制限あり" : "制限なし"} · x${this.#speedMultiplier}`;
    this.#requiredElement("joint-angle").textContent = `${angle.toFixed(3)} rad`;
    this.#requiredElement("target-angle").textContent = `${target.toFixed(3)} rad`;
  }

  #draw(bodies: readonly BodySnapshot[]): void {
    const graphics = this.#graphics;
    if (!graphics) {
      return;
    }

    graphics.clear();
    graphics.lineStyle(2, 0x19364d, 1);
    graphics.beginPath();
    graphics.moveTo(80, WORLD_ORIGIN_Y);
    graphics.lineTo(640, WORLD_ORIGIN_Y);
    graphics.strokePath();

    for (const body of bodies) {
      this.#drawCapsule(body);
    }

    graphics.fillStyle(0xf5f9ff, 1);
    graphics.fillCircle(WORLD_ORIGIN_X, WORLD_ORIGIN_Y, 7);
    graphics.lineStyle(2, 0x0a1926, 1);
    graphics.strokeCircle(WORLD_ORIGIN_X, WORLD_ORIGIN_Y, 7);
  }

  #drawCapsule(body: BodySnapshot): void {
    const graphics = this.#graphics;
    if (!graphics) {
      return;
    }

    const halfLength = body.length / 2;
    const sin = Math.sin(body.angle);
    const cos = Math.cos(body.angle);
    const endA = this.#toScreen(
      body.x + sin * halfLength,
      body.y - cos * halfLength
    );
    const endB = this.#toScreen(
      body.x - sin * halfLength,
      body.y + cos * halfLength
    );
    const color = body.dynamic ? 0xffd166 : 0x4cc9f0;
    const width = body.radius * 2 * PIXELS_PER_METER;

    graphics.lineStyle(width, color, 1);
    graphics.beginPath();
    graphics.moveTo(endA.x, endA.y);
    graphics.lineTo(endB.x, endB.y);
    graphics.strokePath();
    graphics.fillStyle(color, 1);
    graphics.fillCircle(endA.x, endA.y, width / 2);
    graphics.fillCircle(endB.x, endB.y, width / 2);
  }

  #toScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: WORLD_ORIGIN_X + x * PIXELS_PER_METER,
      y: WORLD_ORIGIN_Y - y * PIXELS_PER_METER
    };
  }

  #requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing required UI element: #${id}`);
    }
    return element as T;
  }
}
