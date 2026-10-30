import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettledView } from './settled'

// The rasters are not what is under test: a 1-px stand-in, so a load that gets past the gate resolves.
vi.mock('./sources', () => ({
  loadStill: async () => ({ dispose() {} }),
  loadDepthImage: async () => ({ bits: 16, values: new Float32Array([0.5]) }),
}))

const MOGE = 'loc-2026-10-18T04-10-23-594#moge-2-vitl'

/** A settled meta.json as on disk (only what the loader and gate read), alignment = the recorded chosen fit. */
const settledMeta = (view: string, applied: string, scale: number, n: number, allN: number, medianRel: number, source?: string) => {
  const fit = { n, all: { n: allN, medianRel } }
  return {
    kind: 'settled view', view, inpaint: 'klein', width: 1, height: 1, ...(source ? { source } : {}),
    camera: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], vfovDeg: 37.16, aspect: 1.75 },
    depth: { metersPerUnit: 0.0002 },
    alignment: { applied, scale, shift: 0, scaleOnly: fit, withShift: fit },
  }
}
// The three alley fills E14/E15 found floating in front of the set (meta.json numbers, 2026-10-18).
const FLOATING = [
  settledMeta('view-2026-10-18T04-13-59', 'scale + shift', 0.3484, 412264, 554692, 0.0336),
  settledMeta('view-2026-10-18T04-16-02', 'scale + shift', 0.4017, 402909, 521787, 0.0426),
  settledMeta('view-2026-10-18T04-18-01', 'scale only', 0.3731, 489094, 567652, 0.0436),
]
/** the reprocessed 04-11-44 (x0.904, 3.6 %) and the worst-survival good alley fill 04-35-10 (x0.904, 5.2 %, 78 %) */
const GOOD = [
  settledMeta('view-2026-10-18T04-11-44', 'scale + shift', 0.9043, 766598, 829746, 0.0362),
  settledMeta('view-2026-10-18T04-35-10', 'scale only', 0.9043, 427192, 545170, 0.0517),
]

let files: Record<string, unknown>
beforeEach(() => {
  files = {}
  for (const m of [...FLOATING, ...GOOD]) {
    files[`/lab-assets/renders/${m.view}/settled-klein/meta.json`] = m
    files[`/lab-assets/renders/${m.view}/meta.json`] = { source: MOGE }
  }
  vi.stubGlobal('fetch', async (url: string) => {
    const body = files[url]
    return body ? { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body } : { ok: false, status: 404, text: async () => '' }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('Load settled applies the settle gate to what is already on disk (L-03)', () => {
  it.each(FLOATING.map((m) => m.view))('refuses the floating alley fill %s, naming why', async (view) => {
    await expect(loadSettledView(`${view}/settled-klein`)).rejects.toThrow(
      new RegExp(`^${view}/settled-klein refused \\(its depth fit would misplace the layer\\): scale x0\\.\\d\\d outside x0\\.70-1\\.4 \\(metric depth\\)$`))
  })
  it.each(GOOD.map((m) => m.view))('loads the good alley fill %s', async (view) => {
    await expect(loadSettledView(`${view}/settled-klein`)).resolves.toMatchObject({ folder: `${view}/settled-klein` })
  })
  it("the meta's own source wins over the view's (a non-metric set keeps the wide bound)", async () => {
    const m = { ...FLOATING[0], source: 'x#depth-anything-v2' }
    files[`/lab-assets/renders/${m.view}/settled-klein/meta.json`] = m
    await expect(loadSettledView(`${m.view}/settled-klein`)).resolves.toBeTruthy()
  })
  it('no view meta to read the source from: fails closed onto the metric bound', async () => {
    delete files[`/lab-assets/renders/${FLOATING[1].view}/meta.json`]
    await expect(loadSettledView(`${FLOATING[1].view}/settled-klein`)).rejects.toThrow(/scale x0.40 outside x0.70-1.4 \(metric depth\)/)
  })
  it('a pre-gate meta with no fit residuals is refused, not loaded silently', async () => {
    const m = { ...GOOD[0], alignment: { applied: 'scale only', scale: 1, shift: 0 } }
    files[`/lab-assets/renders/${m.view}/settled-klein/meta.json`] = m
    await expect(loadSettledView(`${m.view}/settled-klein`)).rejects.toThrow(/refused.*median depth error NaN/)
  })
})
