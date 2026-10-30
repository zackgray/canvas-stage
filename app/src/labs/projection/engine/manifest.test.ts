import { describe, expect, it } from 'vitest'
import { toRad, vfovFromFocal } from '../math/camera'
import { convertValue } from '../math/depth'
import { paramsForEntry } from '../ui/settings'
import { conventionForEntry, lensFor, MANIFEST_URLS, mergeManifests, parseManifest } from './manifest'

const BANK = MANIFEST_URLS[0]
const E2 = '/lab-assets/experiments/e2/manifest.json'
const shot = (extra: object) => ({ id: 'wide', image: '/w.png', width: 1344, height: 768, prompt: '', seed: 1, ...extra })
const bank = JSON.stringify({ shots: [shot({ depths: [{ model: 'depth-anything-v2-vitl', path: '/d.png', convention: 'near-bright', bitDepth: 8 }] })] })
// Shape of experiments/e2/manifest.json: metric MoGe entry with its own fovDeg, a relative DA-V2 entry, shot-level fovDeg.
const e2 = JSON.stringify({ shots: [shot({ fovDeg: 40.84, metric: true, depths: [
  { model: 'moge-2-vitl', path: '/m.png', convention: 'near-dark', bitDepth: 16, metersPerUnit: 0.001, metric: true, fovDeg: 40.84 },
  { model: 'depth-anything-v2-vitl', path: '/d.png', convention: 'near-bright', bitDepth: 8 },
] })] })

describe('lab manifests', () => {
  it('lists the E2 manifest alongside the bank, with colliding ids made unique', () => {
    expect(MANIFEST_URLS).toContain(E2)
    const shots = mergeManifests([{ url: BANK, shots: parseManifest(bank, BANK) }, { url: E2, shots: parseManifest(e2, E2) }])!
    expect(shots.map((s) => s.id)).toEqual(['wide', 'e2/wide'])
    expect(shots[1].manifest).toBe(E2)
    expect(mergeManifests([{ url: BANK, shots: parseManifest('<!doctype html>', BANK) }])).toBeNull()
  })

  it("takes the projector's vertical FOV from the manifest, not the 35 mm default", () => {
    const s = parseManifest(e2, E2)![0]
    const aspect = 1344 / 768
    const lens = lensFor(s, s.depths[0], 35, aspect)
    expect(lens.from).toBe('manifest')
    expect(vfovFromFocal(lens.focalMm, aspect)).toBeCloseTo(toRad(40.84), 9)
    expect(lens.label).toMatch(/40\.84° from e2 manifest/)
    // shot-level FOV still applies to a relative map of the same still
    expect(lensFor(s, s.depths[1], 35, aspect).vfovDeg).toBe(40.84)
    // no FOV anywhere: the slider is used and says so
    const b = parseManifest(bank, BANK)![0]
    expect(lensFor(b, b.depths[0], 35, aspect)).toMatchObject({ from: 'slider', focalMm: 35 })
  })

  it('reads metric entries as linear metres, near-dark, 0 = invalid', () => {
    const entry = { ...parseManifest(e2, E2)![0].depths[0], convention: 'near-bright' as const } // metric wins
    expect(conventionForEntry(entry)).toBe('near-dark')
    const p = paramsForEntry(entry)
    expect(p.mode).toBe('linear')
    expect(convertValue(2000 / 65535, conventionForEntry(entry), p)).toBeCloseTo(2, 6) // 2000 raw × 1 mm
    expect(Number.isNaN(convertValue(0, conventionForEntry(entry), p))).toBe(true)
  })
})
