import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeGrey16 } from "../../../experiments/lib/png16.ts";
import { comparePair } from "../diff.ts";
import { readPng } from "../png.ts";

const dir = mkdtempSync(join(tmpdir(), "cs-png16-"));
const W = 4, H = 3;
const grey = (vals: number[]) => { const p = join(dir, `${Math.random().toString(36).slice(2)}.png`); writeGrey16(p, W, H, Uint16Array.from(vals)); return p; };

describe("readPng 16-bit", () => {
  it("round-trips every pixel of a 16-bit grey PNG", () => {
    const vals = Array.from({ length: W * H }, (_, i) => i * 5000 + 7);
    const r = readPng(grey(vals));
    expect(r.bitDepth).toBe(16);
    expect(r.data.length).toBe(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      expect([r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2], r.data[i * 4 + 3]]).toEqual([vals[i], vals[i], vals[i], 65535]);
    }
  });
});

describe("pixel-diff on 16-bit input", () => {
  it("sees a change in the bottom row, outside the mask", () => {
    const a = Array.from({ length: W * H }, () => 30000);
    const b = [...a];
    b[W * H - 1] = 60000; // bottom-right pixel changes
    const mask = Array.from({ length: W * H }, (_, i) => (i === 0 ? 65535 : 0)); // only top-left is inside
    const r = comparePair(grey(a), grey(b), grey(mask), 0);
    expect(r.outside.changed).toBe(1);
    expect(r.inside?.changed).toBe(0);
  });
});
