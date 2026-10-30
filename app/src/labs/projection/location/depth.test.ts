// The depth a picked master is written with, read back by the projection lab's OWN loader path:
// metricDepth -> writeGrey16 -> fetch + decodePng (engine/sources.ts loadDepthImage) -> manifest entry
// (parseManifest -> paramsForEntry / conventionForEntry) -> toDepth = the same metres; lensFor = MoGe's vfov.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeGrey16 } from '../../../../experiments/lib/png16.ts'
import { readExr } from '../../../../experiments/lib/exr.ts'
import { readPng } from '../../../../scripts/lib/png.ts'
import { conventionForEntry, lensFor, MANIFEST_URLS, mergeManifests, parseManifest } from '../engine/manifest'
import { loadDepthImage } from '../engine/sources'
import { toRad, vfovFromFocal } from '../math/camera'
import { toDepth } from '../math/depth'
import { paramsForEntry } from '../ui/settings'
import { readPoints } from '../../../../server/settle/io.ts'
import { H, MOGE_SCALE_ERR, scene, VFOV, W } from '../../../../server/settle/__tests__/synthetic.ts'
import { LOCATIONS_URL } from '../../../../server/location/io.ts'
import { GATE, locationShot, metricDepth, refuseDepth, withShot } from '../../../../server/location/process.ts'

const MANIFEST = `${LOCATIONS_URL}/manifest.json`

/** Serve local files to the lab's fetch-based loader, as the dev server would. */
function serve(files: Record<string, string>) {
  vi.stubGlobal('window', { location: { href: 'http://lab/' } })
  vi.stubGlobal('fetch', async (url: string) => {
    const f = files[new URL(url).pathname]
    return f ? new Response(readFileSync(f)) : new Response('', { status: 404 })
  })
}
afterEach(() => vi.unstubAllGlobals())

const outputs = () => {
  const s = scene()
  return { s, m: { render: s.moge, valid: s.mogeValid, points: s.points, vfovText: `${VFOV}.004\n` } }
}

describe('location depth', () => {
  it('the lab lists the locations manifest', () => {
    expect(MANIFEST_URLS).toContain(MANIFEST)
  })

  it('round trip: written metres come back through the lab loader within quantisation', async () => {
    const { s, m } = outputs()
    const d = metricDepth(m)
    expect(d.vfovDeg).toBe(40)
    expect(d.vfovFrom).toBe('moge')
    expect(refuseDepth(d)).toBeNull()

    const dir = mkdtempSync(path.join(tmpdir(), 'loc-depth-'))
    const file = path.join(dir, 'depth.png')
    writeGrey16(file, W, H, d.values)
    const shot = locationShot({ id: 'loc-2026-10-18T10-20-30-456', width: W, height: H, prompt: 'P', seed: 5, description: 'D',
      framing: 'wide', batch: 'batch-2026-10-18T10-20-30-000', candidate: 2, depth: d })
    const listed = mergeManifests([{ url: MANIFEST, shots: parseManifest(JSON.stringify(withShot(null, shot)), MANIFEST) }])!
    expect(listed).toHaveLength(1)
    const got = listed[0]
    expect(got).toMatchObject({ id: shot.id, prompt: 'P', seed: 5, manifest: MANIFEST })
    const entry = got.depths[0]

    serve({ [entry.path]: file })
    const img = await loadDepthImage(entry.path)
    expect(img.bits).toBe(16)
    const metres = toDepth(img, conventionForEntry(entry), paramsForEntry(entry))
    let worst = 0, sky = 0
    for (let i = 0; i < W * H; i++) {
      const want = s.truth[i] / MOGE_SCALE_ERR
      if (!(want > 0)) { expect(Number.isNaN(metres[i])).toBe(true); sky++; continue }
      worst = Math.max(worst, Math.abs(metres[i] - want))
    }
    expect(sky).toBe(6 * W)
    expect(worst).toBeLessThanOrEqual(d.metersPerUnit * 0.5 + 1e-5)

    // the projector lens is MoGe's measured vfov, not the focal slider
    const lens = lensFor(got, entry, 35, W / H)
    expect(lens.from).toBe('manifest')
    expect(vfovFromFocal(lens.focalMm, W / H)).toBeCloseTo(toRad(40), 9)
  })

  it('falls back to the point-map FOV when MoGe sent no FOV text', () => {
    const { m } = outputs()
    const d = metricDepth({ ...m, vfovText: null })
    expect(d.vfovFrom).toBe('point map')
    expect(d.vfovDeg).toBeCloseTo(40, 1)
  })

  it('refuses a depth that does not agree with its own point map, or has almost none', () => {
    const { m } = outputs()
    const garbled = { ...m, render: { ...m.render, values: m.render.values.map((v, i) => (i % 3 ? v : 1 - v)) } }
    expect(refuseDepth(metricDepth(garbled))).toMatch(/R²/)
    expect(refuseDepth(metricDepth({ ...m, vfovText: '75' }))).toMatch(/disagrees with its point map/)
    expect(refuseDepth(metricDepth({ ...m, valid: new Float32Array(W * H).fill(0) }))).toMatch(/has depth/)
    expect(GATE.minR2).toBeLessThan(0.9999) // E2's worst real fit was 0.99994
  })

  // The real thing, when E2's raw MoGe outputs are on this machine (gitignored): the location path writes the same
  // metres E2 wrote for the same still.
  const E2 = path.resolve(import.meta.dirname, '../../../../public/lab-assets/experiments/e2')
  it.skipIf(!existsSync(path.join(E2, 'raw/wide.moge.depth.exr')))('matches E2 on its wide still', () => {
    const v = readPng(path.join(E2, 'raw/wide.moge.mask.png'))
    const valid = new Float32Array(v.width * v.height).map((_, i) => v.data[i * 4] / v.maxValue)
    const d = metricDepth({ render: readExr(path.join(E2, 'raw/wide.moge.depth.exr')), valid,
      points: readPoints(path.join(E2, 'raw/wide.moge.points.glb')), vfovText: readFileSync(path.join(E2, 'raw/wide.moge.vfov.txt'), 'utf8') })
    const e2 = (JSON.parse(readFileSync(path.join(E2, 'manifest.json'), 'utf8')) as { shots: { id: string; fovDeg: number; depths: { model: string; metersPerUnit: number }[] }[] })
      .shots.find((x) => x.id === 'wide')!
    expect(d.vfovDeg).toBe(e2.fovDeg)
    expect(d.metersPerUnit).toBeCloseTo(e2.depths.find((x) => x.model === 'moge-2-vitl')!.metersPerUnit, 12)
    const theirs = readPng(path.join(E2, 'wide.depth-moge-2.png'))
    let diff = 0
    for (let i = 0; i < d.values.length; i++) if (d.values[i] !== theirs.data[i * 4]) diff++
    expect(diff).toBe(0)
    expect(refuseDepth(d)).toBeNull()
  })
})
