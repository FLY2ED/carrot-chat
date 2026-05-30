import { describe, expect, it } from "vitest";
import { nextDelay, withJitter } from "./reconnect";

describe("nextDelay", () => {
  it("grows exponentially from the base", () => {
    expect(nextDelay(0, 500)).toBe(500);
    expect(nextDelay(1, 500)).toBe(1000);
    expect(nextDelay(2, 500)).toBe(2000);
    expect(nextDelay(3, 500)).toBe(4000);
  });

  it("caps at the max delay", () => {
    expect(nextDelay(10, 500, 10_000)).toBe(10_000);
  });
});

describe("withJitter", () => {
  it("returns the base delay when rng is centered", () => {
    expect(withJitter(1000, () => 0.5)).toBe(1000);
  });

  it("stays within the ±ratio band", () => {
    expect(withJitter(1000, () => 0, 0.25)).toBe(750);
    expect(withJitter(1000, () => 1, 0.25)).toBe(1250);
  });
});
