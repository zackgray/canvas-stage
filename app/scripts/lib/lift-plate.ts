/**
 * Where the clean plate comes from. The plate used to be the temporal median of the 960-wide stabilised frames: soft to
 * begin with, magnified ~3x on a long lens, and CrossView copies that softness. Now it is built at 1920 from the
 * source frames resampled once (scripts/lift_plate.py), and where the set is static it is real single-frame pixels, not
 * the median's average of the stabilisation's sub-pixel jitter. `legacy` writes the old 960 plate (an old pack's rule).
 */
export type PlateMode = "sharp" | "median" | "legacy";

export const PLATE_WIDTH = 1920;

export function parsePlateMode(s: string | undefined): PlateMode {
  const m = s ?? "sharp";
  if (m === "sharp" || m === "median" || m === "legacy") return m;
  throw new Error(`--plate ${s}: expected sharp, median or legacy`);
}

/** The plate's file in the lift work dir, named by its rule so a cache made under another rule is not reused. */
export const plateWorkFile = (mode: PlateMode): string => (mode === "legacy" ? "background.png" : `plate1920-${mode}.png`);

/** Every file in a lift work dir that may be the plate a pack was written from (pack-plate-depth.ts checks them). */
export const plateWorkCandidates = (): string[] => ["background.png", plateWorkFile("sharp"), plateWorkFile("median")];

/** The `plate` step's size: the plate is as wide as the 1920 source, at the set's aspect. */
export const plateSize = (aspect: number): { width: number; height: number } => ({ width: PLATE_WIDTH, height: Math.round(PLATE_WIDTH / aspect) });
