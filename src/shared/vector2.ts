export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export function vec(x: number, y: number): Vector2 {
  return { x, y };
}

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vector2, factor: number): Vector2 {
  return { x: a.x * factor, y: a.y * factor };
}

export function midpoint(a: Vector2, b: Vector2): Vector2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function length(a: Vector2): number {
  return Math.hypot(a.x, a.y);
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleOf(a: Vector2): number {
  return Math.atan2(a.y, a.x);
}

export function wrapSignedRadians(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function isFiniteVector(a: Vector2): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y);
}
