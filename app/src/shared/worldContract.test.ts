import { describe, expect, it } from 'vitest'
import { toPerformance } from '../project/performance'
import {
  applyPin, cameraHeightLabel, readLensFrom, readPackPin, readStandInPlace, readSurroundColour, readSurroundFloor, readWorld,
} from './worldContract'

describe('meta.json world', () => {
  it('reads an old world (stage 1: eyeHeightM only, no preset, no recipe) as eye 1.6 on the legacy recipe', () => {
    const meta = { id: 'loc-x', world: { eyeHeightM: 1.6, horizonRow: 540.5, builtAt: null } }
    expect(readWorld(meta)).toEqual({ eyeHeightM: 1.6, cameraPreset: 'eye', recipe: 'e57-opt3+seam', horizonRow: 540.5, builtAt: null, kind: 'pano' })
  })

  it('defaults a meta.json with no world at all, and garbage, to eye 1.6 / e57-opt3+seam', () => {
    for (const m of [{}, null, undefined, 'x', { world: 'x' }, { world: { eyeHeightM: -1, cameraPreset: 'knee', recipe: 'e99' } }]) {
      expect(readWorld(m)).toEqual({ eyeHeightM: 1.6, cameraPreset: 'eye', recipe: 'e57-opt3+seam', horizonRow: null, builtAt: null, kind: 'pano' })
    }
  })

  it('fills the height from the preset, and the preset from a chest height', () => {
    expect(readWorld({ world: { cameraPreset: 'chest' } }).eyeHeightM).toBe(1.2)
    expect(readWorld({ world: { eyeHeightM: 1.2 } }).cameraPreset).toBe('chest')
    expect(readWorld({ world: { eyeHeightM: 1.45 } })).toMatchObject({ eyeHeightM: 1.45, cameraPreset: 'eye' })
    expect(readWorld({ eyeHeightM: 1.2, cameraPreset: 'chest', recipe: 'pano-590011' })).toMatchObject({ recipe: 'pano-590011' })
  })

  it('reads the world kind (Stage3D): kit when meta.json world says so, else pano (every older world, the top-level kind, garbage)', () => {
    expect(readWorld({ kind: 'location', world: { kind: 'kit', eyeHeightM: 1.6 } }).kind).toBe('kit')
    expect(readWorld({ kind: 'kit' }).kind).toBe('kit') // the world object itself
    for (const m of [{}, { kind: 'location' }, { kind: 'location', world: { eyeHeightM: 1.6 } }, { world: { kind: 'splat' } }]) expect(readWorld(m).kind).toBe('pano')
  })

  it('labels the camera height', () => {
    expect(cameraHeightLabel(readWorld({}))).toBe('eye 1.6 m')
    expect(cameraHeightLabel(readWorld({ world: { cameraPreset: 'chest' } }))).toBe('chest 1.2 m')
    expect(cameraHeightLabel(readWorld({ world: { eyeHeightM: 1.45 } }))).toBe('custom 1.45 m')
  })
})

describe('meta.json lens.from and surround', () => {
  it('reads lens.from including known; absent or unknown is null', () => {
    expect(readLensFrom({ lens: { vfovDeg: 40, from: 'known' } })).toBe('known')
    expect(readLensFrom({ lens: { vfovDeg: 40, from: 'moge' } })).toBe('moge')
    expect(readLensFrom({ lens: { vfovDeg: 40 } })).toBeNull()
    expect(readLensFrom({ lens: { from: 'guess' } })).toBeNull()
  })

  it('has no hi-res colour or floor on an old surround', () => {
    const old = { surround: { url: '/s.png', distUrl: '/d.png', width: 2048, height: 1024 } }
    expect(readSurroundColour(old)).toBeNull()
    expect(readSurroundFloor(old)).toBeNull()
    expect(readSurroundColour({})).toBeNull()
  })

  it('reads the 8192 colour (2:1 only) and the floor (up normalised)', () => {
    const s = { surround: { url: '/s.png', colourUrl: '/c.png', colourWidth: 8192, colourHeight: 4096, floor: { up: [0, 2, 0], heightM: 1.6 } } }
    expect(readSurroundColour(s)).toEqual({ url: '/c.png', width: 8192, height: 4096 })
    expect(readSurroundFloor(s)).toEqual({ up: [0, 1, 0], heightM: 1.6 })
    expect(readSurroundColour({ surround: { colourUrl: '/c.png', colourWidth: 8192, colourHeight: 8192 } })).toBeNull()
    expect(readSurroundFloor({ surround: { floor: { up: [0, 0, 0], heightM: 1.6 } } })).toBeNull()
  })
})

describe('place.json stand-in mode', () => {
  const base = { sid: 'perf-1', created: 'x', cast: [], firstFrame: null }

  it('reads a classic Place session as not stand-in', () => {
    expect(readStandInPlace({ ...base, sourceLocationId: 'loc-a', locationId: 'loc-a-plate' })).toBeNull()
    expect(readStandInPlace({ ...base, mode: 'standin' })).toBeNull() // no world id
  })

  it('fills stand-in defaults and drops bad entries', () => {
    const place = {
      ...base, mode: 'standin', locationId: 'loc-world',
      standins: [
        { cardId: 'c1', version: 2, feetPx: [900, 1000], boxPx: [850, 400, 950, 1000] },
        { cardId: 'c2', version: 1, view: 'side', mirror: true, heightM: 1.9, feetPx: [1200, 980], boxPx: [1150, 380, 1250, 980] },
        { cardId: 'c3', version: 1, feetPx: [1, 2] }, // no box
        { version: 1, feetPx: [1, 2], boxPx: [0, 0, 1, 1] }, // no card
      ],
    }
    expect(readStandInPlace(place)).toEqual({
      mode: 'standin', locationId: 'loc-world', cameraHeightM: 1.6,
      standins: [
        { cardId: 'c1', version: 2, view: 'front', mirror: false, heightM: 1.75, feetPx: [900, 1000], boxPx: [850, 400, 950, 1000] },
        { cardId: 'c2', version: 1, view: 'side', mirror: true, heightM: 1.9, feetPx: [1200, 980], boxPx: [1150, 380, 1250, 980] },
      ],
    })
    expect(readStandInPlace({ ...place, cameraHeightM: 1.2, standins: 'x' })).toMatchObject({ cameraHeightM: 1.2, standins: [] })
  })
})

describe('pack manifest pin', () => {
  const pack = { id: 'p', depth: { encoding: 'planar-metres-16bit', metersPerUnit: 0.001 }, backgroundDepth: { file: 'b.png', metersPerUnit: 0.002 }, prompt: 'x' }

  it('reads an unpinned pack as null', () => {
    expect(readPackPin(pack)).toBeNull()
    expect(readPackPin({ ...pack, pin: { k: 0, frames: [], residualCm: 1, rawMetersPerUnit: 0.001 } })).toBeNull()
  })

  it('writes the pin in place from the raw scale, scales the performer only (never the plate), and a re-pin is idempotent', () => {
    const once = applyPin(pack, { k: 1.5, frames: [3, 9], residualCm: 12 })
    expect(once.depth.metersPerUnit).toBeCloseTo(0.0015, 12)
    expect(once.backgroundDepth).toEqual(pack.backgroundDepth) // the plate's floor stays where the pin measured it
    expect(readPackPin(once)).toEqual({ k: 1.5, frames: [3, 9], residualCm: 12, rawMetersPerUnit: 0.001 })
    expect(once.prompt).toBe('x')
    const twice = applyPin(once, { k: 1.5, frames: [3, 9], residualCm: 12 })
    expect(twice).toEqual(once)
    const repinned = applyPin(once, { k: 1.4, frames: [3], residualCm: 8 })
    expect(repinned.depth.metersPerUnit).toBeCloseTo(0.0014, 12)
    expect(repinned.backgroundDepth).toEqual(pack.backgroundDepth)
    expect(readPackPin(repinned)?.rawMetersPerUnit).toBe(0.001)
  })

  it('survives the client pack parser (pinned packs keep pin, unpinned packs have none)', () => {
    const full = {
      ...pack, label: 'p', locationId: 'loc-a', fps: 24, frames: 9, width: 960, height: 544,
      source: { vfovDeg: 50, aspect: 960 / 544, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] },
      files: { color: 'c_%03d.png', depth: 'd_%03d.png', mask: 'm_%03d.png' }, sourceClip: 's.mp4', background: 'b.png',
    }
    expect(toPerformance(full).pin).toBeUndefined()
    expect(toPerformance(applyPin(full, { k: 1.5, frames: [1], residualCm: 5 })).pin).toEqual({ k: 1.5, frames: [1], residualCm: 5, rawMetersPerUnit: 0.001 })
  })
})
