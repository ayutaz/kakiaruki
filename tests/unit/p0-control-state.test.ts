import { describe, expect, it } from "vitest";

import { createInitialP0ControlState } from "../../src/p0-control-state.ts";

describe("createInitialP0ControlState", () => {
  it("restores every interactive control to the P0 defaults", () => {
    const changedState = {
      motorEnabled: false,
      limitEnabled: false,
      speedMultiplier: 8
    };

    const resetState = createInitialP0ControlState();

    expect(changedState).not.toEqual(resetState);
    expect(resetState).toEqual({
      motorEnabled: true,
      limitEnabled: true,
      speedMultiplier: 1
    });
    expect(resetState).not.toBe(createInitialP0ControlState());
  });
});
