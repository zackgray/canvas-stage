// The settle sanity gate: whether a settled view's depth fit is sane enough to become a layer. Dependency-free, so
// the dev server (server/settle refuses the fit before writing) and the lab (engine/settled.ts refuses an
// already-written folder on load) apply the same rule: a bound changed here moves on both sides.
//
// Evidence: every settled folder on disk (27 meta.json, all MoGe-2 sources) recomputed 2026-10-18. Good fits:
// scale x0.904-1.228, all-pixel median error <= 5.2 %, >= 78 % of the fit pixels surviving trimming. Broken:
//   E11 route S 80° turn             x6.96  42.8 %  19 %
//   auto-fill turn 21:49              x1.74  11.6 %  47 %
//   E11-M placements a / b            x1.55   5.5 %  76 %  /  x1.72   8.0 %  54 %
//   E11-M commanded (Qwen) a / b      x0.96  14.5 %  41 %  /  x1.19  27.7 %  23 %
//   alley fills 04-13-59/16-02/18-01  x0.35   3.4 %  74 %  /  x0.40   4.3 %  77 %  /  x0.37  4.4 %  86 %
// The alley fills and E11-M a pass residual and survival: the overlap fits, yet the patch is at the wrong distance
// (E15 measured the alley three in front of the original at its own camera on 26 / 17 / 3-11 % of covered pixels).
// So for a metric depth model scale is a real bound, not a backstop: x0.7-1.4 sits between the worst good fits
// (x0.904, x1.228) and the nearest broken ones (x0.402, x1.548) with margin both ways. A non-metric depth model's
// scale is arbitrary, so it keeps only the wide x1/3-3 backstop.

/** The fit numbers the gate reads (structurally an align.ts Alignment). */
export interface FitStats {
  scale: number
  /** fit pixels surviving trimming */
  n: number
  /** every candidate pixel, before trimming */
  all: { n: number; medianRel: number }
}

export const GATE = {
  maxMedianRel: 0.1, minSurvival: 0.6,
  metric: { minScale: 0.7, maxScale: 1.4 },
  other: { minScale: 1 / 3, maxScale: 3 },
} as const

/** Depth models whose output is in metres (scale should come out near 1). */
const METRIC = /^moge-2/

/**
 * Whether the set's depth model is metric, from a view's `source` ("<shot>#<depth model>"). No model named = metric:
 * every set the lab builds is MoGe-2, so an unlabelled source fails closed onto the tight bound.
 */
export function isMetricDepth(source: string | undefined): boolean {
  const model = source?.includes('#') ? source.slice(source.lastIndexOf('#') + 1) : ''
  return !model || METRIC.test(model)
}

/** Why this fit must not become a layer, or null when it is sane. `source`: the view's source, for the scale bound. */
export function refuseFit(a: FitStats, source?: string): string | null {
  const survival = a.all.n > 0 ? a.n / a.all.n : 0
  const metric = isMetricDepth(source)
  const s = metric ? GATE.metric : GATE.other
  const why: string[] = []
  if (!(a.all.medianRel <= GATE.maxMedianRel)) why.push(`median depth error ${(a.all.medianRel * 100).toFixed(1)} % > ${GATE.maxMedianRel * 100} %`)
  if (!(survival >= GATE.minSurvival)) why.push(`only ${Math.round(survival * 100)} % of the overlap agrees (< ${GATE.minSurvival * 100} %)`)
  if (!(a.scale >= s.minScale && a.scale <= s.maxScale)) {
    why.push(`scale x${a.scale.toFixed(2)} outside x${s.minScale.toFixed(2)}-${s.maxScale} (${metric ? 'metric' : 'non-metric'} depth)`)
  }
  return why.length ? why.join('; ') : null
}

/** A settled meta.json's `alignment` block, as server/settle/io.ts writes it. */
export interface SettledAlignment {
  applied: string
  scale: number
  shift: number
  scaleOnly?: { n?: number; all?: { n?: number; medianRel?: number } }
  withShift?: { n?: number; all?: { n?: number; medianRel?: number } }
}

/** The chosen fit's numbers back out of a written meta; anything missing reads as NaN, which the gate refuses. */
export function fitFromMeta(al: SettledAlignment | undefined): FitStats {
  const chosen = al?.applied === 'scale + shift' ? al.withShift : al?.scaleOnly
  const num = (v: number | undefined) => (typeof v === 'number' ? v : NaN)
  return { scale: num(al?.scale), n: num(chosen?.n), all: { n: num(chosen?.all?.n), medianRel: num(chosen?.all?.medianRel) } }
}
