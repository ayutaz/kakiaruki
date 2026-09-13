export interface P0ControlState {
  motorEnabled: boolean;
  limitEnabled: boolean;
  speedMultiplier: number;
}

export function createInitialP0ControlState(): P0ControlState {
  return {
    motorEnabled: true,
    limitEnabled: true,
    speedMultiplier: 1
  };
}
