import { describe, it, expect } from "vitest";

// Smoke test: confirms the Vitest pipeline runs at all.
describe("vitest pipeline", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
