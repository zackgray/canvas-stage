import { describe, expect, it } from "vitest";
import { exclusionMatches, grownBoxRect, matchArg, parseExclusion, source1920Args } from "../lift-exclusion.ts";

// the E34 cast clip's two fighters in pack px (960 x 544): they fill ~70 % of the frame's height
const boxes = [[245, 130, 505, 510], [470, 140, 685, 510]];

describe("exclusion choice", () => {
  it("defaults to SAM masks, dilated a little", () => {
    expect(parseExclusion(undefined)).toEqual({ kind: "masks", dilate: 0.0125 });
    expect(matchArg(parseExclusion(undefined), boxes, 960, 544)).toBe("masks:0.0125");
  });
  it("keeps the legacy grown box selectable and rejects nonsense", () => {
    expect(parseExclusion("boxes")).toEqual({ kind: "boxes", margin: 0.5 });
    expect(parseExclusion("boxes:0.1")).toEqual({ kind: "boxes", margin: 0.1 });
    expect(() => parseExclusion("blur")).toThrow();
    expect(() => parseExclusion("masks:2")).toThrow();
  });
});

describe("why the grown box failed close framings", () => {
  it("the old half-size margin covers most of the frame the fighters fill", () => {
    const [x0, y0, x1, y1] = grownBoxRect(boxes, 0.5, 960, 544);
    expect((x1 - x0) * (y1 - y0)).toBeGreaterThan(0.85); // ~90 % of the frame: nothing left to register on
  });
  it("is what the legacy mode passes to the match, as fractions", () => {
    expect(matchArg({ kind: "boxes", margin: 0.1 }, boxes, 960, 544)).toBe(`box:${grownBoxRect(boxes, 0.1, 960, 544).join(",")}`);
  });
});

describe("cache and record", () => {
  it("reuses a cached match only under the same exclusion", () => {
    const rec = { kind: "masks" as const, spec: "0.0125" };
    expect(exclusionMatches(rec, "masks:0.0125")).toBe(true);
    expect(exclusionMatches(rec, "masks:0.02")).toBe(false);
    expect(exclusionMatches(rec, "box:0,0,1,1")).toBe(false);
    expect(exclusionMatches(undefined, "masks:0.0125")).toBe(false);
  });
  it("encodes the 1920 source with the pack source's codec, one frame per pack frame", () => {
    const a = source1920Args("w/src1920", 97, 24, "pack/source1920.mp4");
    expect(a).toEqual(expect.arrayContaining(["w/src1920/f_%03d.png", "97", "libx264", "yuv444p", "pack/source1920.mp4"]));
    expect(a[a.indexOf("-crf") + 1]).toBe("4");
  });
});
