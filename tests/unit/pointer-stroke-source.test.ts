import { describe, expect, it, vi } from "vitest";

import { StrokeRecorder } from "../../src/domain/stroke/stroke-recorder.ts";
import type { StrokePoint } from "../../src/domain/stroke/stroke-point.ts";
import {
  bindPointerStroke,
  keyToStrokeCommand,
  type StrokeEventListener,
  type StrokeInputTarget
} from "../../src/game/input/pointer-stroke-source.ts";

interface PointerEventLike {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly isPrimary?: boolean;
  preventDefault?(): void;
}

class FakeTarget implements StrokeInputTarget {
  readonly listeners = new Map<string, StrokeEventListener[]>();
  readonly captured: number[] = [];
  readonly released: number[] = [];

  addEventListener(type: string, listener: StrokeEventListener): void {
    const existing = this.listeners.get(type);
    if (existing) {
      existing.push(listener);
    } else {
      this.listeners.set(type, [listener]);
    }
  }

  removeEventListener(type: string, listener: StrokeEventListener): void {
    const existing = this.listeners.get(type);
    if (!existing) {
      return;
    }
    const index = existing.indexOf(listener);
    if (index >= 0) {
      existing.splice(index, 1);
    }
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.released.push(pointerId);
  }

  getBoundingClientRect() {
    return { left: 20, top: 40, width: 640, height: 480 };
  }

  emit(type: string, event: PointerEventLike): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as unknown as Event);
    }
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((total, list) => total + list.length, 0);
  }
}

function pointer(x: number, y: number, pointerId = 1): PointerEventLike {
  return { pointerId, clientX: x + 20, clientY: y + 40, isPrimary: true };
}

function setup() {
  const target = new FakeTarget();
  const recorder = new StrokeRecorder({
    bounds: { width: 640, height: 480 },
    minPointDistance: 4
  });
  const onFinish = vi.fn<(points: readonly StrokePoint[]) => void>();
  const onChange = vi.fn<(points: readonly StrokePoint[]) => void>();
  const onCancel = vi.fn<() => void>();
  const binding = bindPointerStroke(target, recorder, { onFinish, onChange, onCancel });
  return { target, recorder, binding, onFinish, onChange, onCancel };
}

describe("bindPointerStroke", () => {
  it("turns client coordinates into element local coordinates", () => {
    const { target, recorder } = setup();

    target.emit("pointerdown", pointer(100, 200));

    expect(recorder.points[0]).toMatchObject({ x: 100, y: 200 });
  });

  it("records a whole stroke from down to up", () => {
    const { target, onFinish, onChange } = setup();

    target.emit("pointerdown", pointer(100, 200));
    target.emit("pointermove", pointer(140, 200));
    target.emit("pointermove", pointer(180, 200));
    target.emit("pointerup", pointer(180, 200));

    expect(onChange).toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]![0]).toHaveLength(3);
  });

  it("ignores movement before the stroke starts", () => {
    const { target, recorder, onChange } = setup();

    target.emit("pointermove", pointer(140, 200));

    expect(recorder.points).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("captures the pointer so that leaving the element does not lose the stroke", () => {
    const { target } = setup();

    target.emit("pointerdown", pointer(100, 200));
    target.emit("pointerup", pointer(100, 200));

    expect(target.captured).toEqual([1]);
    expect(target.released).toEqual([1]);
  });

  it("throws the stroke away when the pointer is cancelled", () => {
    const { target, recorder, onCancel, onFinish } = setup();

    target.emit("pointerdown", pointer(100, 200));
    target.emit("pointermove", pointer(150, 200));
    target.emit("pointercancel", pointer(150, 200));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
    expect(recorder.points).toHaveLength(0);
  });

  it("ignores a second pointer while one stroke is already being drawn", () => {
    const { target, onFinish } = setup();

    target.emit("pointerdown", pointer(100, 200, 1));
    target.emit("pointerdown", pointer(300, 200, 2));
    target.emit("pointermove", pointer(300, 260, 2));
    target.emit("pointerup", pointer(300, 260, 2));

    expect(onFinish).not.toHaveBeenCalled();
  });

  it("removes every listener when disposed", () => {
    const { target, binding } = setup();
    expect(target.listenerCount).toBeGreaterThan(0);

    binding.dispose();

    expect(target.listenerCount).toBe(0);
  });

  it("works on a target without pointer capture support", () => {
    const target = new FakeTarget();
    const withoutCapture: StrokeInputTarget = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      getBoundingClientRect: target.getBoundingClientRect.bind(target)
    };
    const recorder = new StrokeRecorder({ bounds: { width: 640, height: 480 } });
    const onFinish = vi.fn();
    bindPointerStroke(withoutCapture, recorder, { onFinish });

    target.emit("pointerdown", pointer(100, 200));
    target.emit("pointerup", pointer(100, 200));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe("keyToStrokeCommand", () => {
  it("maps the editing keys the plan names", () => {
    expect(keyToStrokeCommand({ key: "z", ctrlKey: true, metaKey: false })).toBe("undo");
    expect(keyToStrokeCommand({ key: "z", ctrlKey: false, metaKey: true })).toBe("undo");
    expect(keyToStrokeCommand({ key: "Backspace", ctrlKey: false, metaKey: false })).toBe(
      "clear"
    );
    expect(keyToStrokeCommand({ key: "Escape", ctrlKey: false, metaKey: false })).toBe(
      "cancel"
    );
    expect(keyToStrokeCommand({ key: "Enter", ctrlKey: false, metaKey: false })).toBe(
      "confirm"
    );
  });

  it("ignores a plain z and any other key", () => {
    expect(keyToStrokeCommand({ key: "z", ctrlKey: false, metaKey: false })).toBeNull();
    expect(keyToStrokeCommand({ key: "a", ctrlKey: true, metaKey: false })).toBeNull();
    expect(keyToStrokeCommand({ key: "F5", ctrlKey: false, metaKey: false })).toBeNull();
  });
});
