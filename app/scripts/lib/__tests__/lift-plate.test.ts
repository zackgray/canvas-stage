import { describe, expect, it } from "vitest";
import { parsePlateMode, plateSize, plateWorkCandidates, plateWorkFile } from "../lift-plate.ts";

describe("plate source", () => {
  it("defaults to the sharp 1920 plate, keeps the old rule selectable, rejects nonsense", () => {
    expect(parsePlateMode(undefined)).toBe("sharp");
    expect(parsePlateMode("median")).toBe("median");
    expect(parsePlateMode("legacy")).toBe("legacy");
    expect(() => parsePlateMode("blurry")).toThrow();
  });
  it("names the work file by its rule, and legacy stays the 960 background", () => {
    expect(plateWorkFile("sharp")).toBe("plate1920-sharp.png");
    expect(plateWorkFile("median")).not.toBe(plateWorkFile("sharp"));
    expect(plateWorkFile("legacy")).toBe("background.png");
    expect(plateWorkCandidates()).toContain("background.png");
    expect(plateWorkCandidates()).toContain(plateWorkFile("sharp"));
  });
  it("is 1920 wide at the set's aspect (the pack's 960x544 doubles to 1920x1088)", () => {
    expect(plateSize(960 / 544)).toEqual({ width: 1920, height: 1088 });
  });
});
