export interface MotorSpeedInput {
  readonly targetAngle: number;
  readonly currentAngle: number;
  readonly relativeAngularVelocity: number;
  readonly proportionalGain: number;
  readonly derivativeGain: number;
  readonly maxMotorSpeed: number;
}

function wrapSignedRadians(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function calculateMotorSpeed(input: MotorSpeedInput): number {
  const values = Object.values(input);
  if (!values.every(Number.isFinite)) {
    throw new RangeError("motor controller values must all be finite");
  }
  if (input.maxMotorSpeed < 0) {
    throw new RangeError("maxMotorSpeed must be non-negative");
  }

  const angleError = wrapSignedRadians(input.targetAngle - input.currentAngle);
  const requestedSpeed =
    input.proportionalGain * angleError -
    input.derivativeGain * input.relativeAngularVelocity;

  return Math.max(-input.maxMotorSpeed, Math.min(input.maxMotorSpeed, requestedSpeed));
}
