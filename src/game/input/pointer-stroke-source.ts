import type { StrokePoint } from "../../domain/stroke/stroke-point.ts";
import type { StrokeRecorder } from "../../domain/stroke/stroke-recorder.ts";

export interface PointerLike {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  preventDefault?: () => void;
}

/**
 * DOM要素のうち、この adapter が使う部分だけ。テストでは最小のfakeを渡す。
 */
export type StrokeEventListener = (event: Event) => void;

export interface StrokeInputTarget {
  addEventListener(type: string, listener: StrokeEventListener, options?: unknown): void;
  removeEventListener(type: string, listener: StrokeEventListener, options?: unknown): void;
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

export interface StrokeInputHandlers {
  onChange?(points: readonly StrokePoint[]): void;
  onFinish?(points: readonly StrokePoint[]): void;
  onCancel?(): void;
}

export interface StrokeInputBinding {
  dispose(): void;
}

/**
 * Pointerイベントを `StrokeRecorder` へ流すだけの薄い層。
 * 判定・変換はdomain側が行い、ここはDOMの都合だけを引き受ける。
 */
export function bindPointerStroke(
  target: StrokeInputTarget,
  recorder: StrokeRecorder,
  handlers: StrokeInputHandlers = {}
): StrokeInputBinding {
  let activePointerId: number | null = null;

  const toLocal = (event: PointerLike, time: number): StrokePoint => {
    const rect = target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, time };
  };

  const now = (): number =>
    typeof performance === "undefined" ? Date.now() : performance.now();

  const onPointerDown = (event: PointerLike): void => {
    if (activePointerId !== null) {
      return;
    }
    activePointerId = event.pointerId;
    event.preventDefault?.();
    target.setPointerCapture?.(event.pointerId);
    recorder.reset();
    recorder.begin(toLocal(event, now()));
    handlers.onChange?.(recorder.points);
  };

  const onPointerMove = (event: PointerLike): void => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    if (recorder.extend(toLocal(event, now()))) {
      handlers.onChange?.(recorder.points);
    }
  };

  const release = (event: PointerLike): void => {
    target.releasePointerCapture?.(event.pointerId);
    activePointerId = null;
  };

  const onPointerUp = (event: PointerLike): void => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    recorder.extend(toLocal(event, now()));
    const points = recorder.finish();
    release(event);
    handlers.onFinish?.(points);
  };

  const onPointerCancel = (event: PointerLike): void => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    recorder.cancel();
    release(event);
    handlers.onCancel?.();
  };

  const asListener =
    (handler: (event: PointerLike) => void): StrokeEventListener =>
    (event: Event): void => {
      handler(event as unknown as PointerLike);
    };

  const bindings: readonly [string, StrokeEventListener][] = [
    ["pointerdown", asListener(onPointerDown)],
    ["pointermove", asListener(onPointerMove)],
    ["pointerup", asListener(onPointerUp)],
    ["pointercancel", asListener(onPointerCancel)]
  ];

  for (const [type, listener] of bindings) {
    target.addEventListener(type, listener);
  }

  return {
    dispose(): void {
      for (const [type, listener] of bindings) {
        target.removeEventListener(type, listener);
      }
      activePointerId = null;
    }
  };
}

export type StrokeCommand = "undo" | "clear" | "cancel" | "confirm";

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/** keyboardだけで主要操作へ到達できるようにするための写像。 */
export function keyToStrokeCommand(event: KeyLike): StrokeCommand | null {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    return "undo";
  }
  if (event.ctrlKey || event.metaKey) {
    return null;
  }
  switch (event.key) {
    case "Backspace":
    case "Delete":
      return "clear";
    case "Escape":
      return "cancel";
    case "Enter":
      return "confirm";
    default:
      return null;
  }
}
