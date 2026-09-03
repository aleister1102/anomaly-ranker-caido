import { describe, expect, it } from "vitest";
import { getStatusColor } from "../src/utils/colors.js";

describe("getStatusColor", () => {
  it.each([
    [101, "#60a5fa"],
    [200, "#4ade80"],
    [308, "#facc15"],
    [451, "#fb923c"],
    [500, "#f87171"],
    [0, "#94a3b8"],
  ])("maps status %s to %s", (status, color) => {
    expect(getStatusColor(status)).toBe(color);
  });
});
