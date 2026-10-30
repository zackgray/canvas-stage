import { PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { describe, expect, it } from 'vitest'
import { applyLevel, fetchLevelFile, getActiveLevel, locationOfSource, parseLevelFile, worldLevel } from './level'
import { orbitAround } from './viewMoves'

// OrbitControls only needs somewhere to listen
const fakeDom = () => ({ addEventListener() {}, removeEventListener() {}, style: {}, setPointerCapture() {}, releasePointerCapture() {}, getRootNode: () => ({ addEventListener() {}, removeEventListener() {} }), ownerDocument: { addEventListener() {}, removeEventListener() {} } }) as unknown as HTMLElement
const warehouse = { up: [-0.0018, 0.99909, -0.04271], cameraHeightM: 1.402, method: 'floor-ransac' }

describe('level.json', () => {
  it('parses a fit and refuses junk', () => {
    expect(parseLevelFile(warehouse)?.cameraHeightM).toBe(1.402)
    expect(parseLevelFile({ up: [0, 0, 0] })).toBeNull()
    expect(parseLevelFile(null)).toBeNull()
    expect(parseLevelFile({ ...warehouse, cameraHeightM: null })?.cameraHeightM).toBeNull()
  })

  it('the assumed fallback is no level; a fit goes to world through the projector', () => {
    const cam = new PerspectiveCamera()
    cam.position.set(0, 1.6, 0)
    cam.rotation.x = (-4.3 * Math.PI) / 180
    cam.updateMatrixWorld()
    expect(worldLevel({ up: [0, 1, 0], cameraHeightM: null, method: 'assumed' }, cam)).toBeNull()
    const lv = worldLevel(parseLevelFile(warehouse)!, cam)!
    expect(lv.up.length()).toBeCloseTo(1, 9)
    expect(lv.up.dot(lv.floor!.clone().sub(cam.position))).toBeCloseTo(-1.402, 6)
  })

  it('finds the location under a prefixed source id and tolerates a miss', async () => {
    expect(locationOfSource('locations/loc-1')).toBe('loc-1')
    let url = ''
    const ok = (async (u: string) => { url = u; return { ok: true, json: async () => warehouse } }) as unknown as typeof fetch
    expect((await fetchLevelFile('a/loc-1', ok))?.method).toBe('floor-ransac')
    expect(url).toBe('/lab-assets/locations/loc-1/level.json')
    const miss = (async () => ({ ok: false })) as unknown as typeof fetch
    expect(await fetchLevelFile('loc-1', miss)).toBeNull()
    const html = (async () => ({ ok: true, json: async () => { throw new Error('not json') } })) as unknown as typeof fetch
    expect(await fetchLevelFile('loc-1', html)).toBeNull()
  })

  it('the orbit buttons and the mouse orbit turn about the fitted up', () => {
    const view = new PerspectiveCamera()
    const controls = new OrbitControls(view, fakeDom())
    const up = new Vector3(0, Math.cos(0.117), Math.sin(0.117))
    applyLevel({ view, controls }, { up, floor: null })
    expect(getActiveLevel()?.up).toBe(up)
    view.position.set(0, 1.6, 4)
    controls.target.set(0, 1.2, -4)
    controls.update()
    const h0 = up.dot(view.position)
    orbitAround(view, controls, 80, 0)
    expect(Math.abs(up.dot(view.position) - h0)).toBeLessThan(0.02)
    // the mouse orbit: OrbitControls turns about view.up, so a horizontal drag keeps the height along it
    ;(controls as unknown as { _rotateLeft(a: number): void })._rotateLeft(1)
    controls.update()
    expect(Math.abs(up.dot(view.position) - h0)).toBeLessThan(0.02)
    applyLevel({ view, controls }, null)
    expect(view.up.toArray()).toEqual([0, 1, 0])
    expect(getActiveLevel()).toBeNull()
  })
})
