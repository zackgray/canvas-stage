// Generated set pieces in a world (recipe wave): a glb kit item is loaded behind World3D.ready into a holder the scene already
// has, normalised (centred, base on the ground), turned by yawOffsetDeg, sized by unitScale x scale, sunk by `sink`, tagged with
// its pieceTag; the massing mesh rides along hidden until setMassing shows it. The fixture is a 2 x 1 x 0.5 box sitting off-centre.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { KitItem, ScenePlan } from '../contract.ts'
import { GLB_MASSING, GLB_PRECISE, parseGlb, setGlbLoader, setMassing, type GlbLoad } from '../glbPiece.ts'
import { PLANS } from '../presets.ts'
import { buildWorld } from '../world.ts'

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'piece-box.glb')
const bytes = () => { const b = readFileSync(FIXTURE); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const loads: string[] = []
const fixtureLoader: GlbLoad = async (url) => { loads.push(url); return parseGlb(bytes()) }
let restore: GlbLoad | null = null
afterEach(() => { if (restore) setGlbLoader(restore); restore = null; loads.length = 0 })

const piece = (o: Partial<KitItem> = {}): KitItem => ({
  kind: 'steam locomotive', at: [9, -14], yawDeg: 30, pieceTag: 'prop:engine',
  glb: { url: '/lab-assets/locations/loc-x/pieces/engine/p-1/mesh.glb', yawOffsetDeg: 90, unitScale: 4, sink: 0.5 }, ...o,
})
const plan = (...kit: KitItem[]): ScenePlan => ({ ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), puddles: 0, tufts: 0, kit })
const holderOf = (s: THREE.Scene) => s.getObjectByName('glb-pieces') as THREE.Group

describe('a generated piece in the world', () => {
  it('lands behind ready in the holder the scene had from the start, placed, turned, sized, sunk and tagged', async () => {
    restore = setGlbLoader(fixtureLoader)
    const w = buildWorld(plan(piece({ yawDeg: 0 })))
    const holder = holderOf(w.scene)
    expect(holder).toBeTruthy()
    expect(holder.children).toHaveLength(0) // synchronous build: nothing yet
    await w.ready
    expect(holder.children).toHaveLength(1)
    const p = holder.children[0]
    expect(p.userData.entity).toBe('prop:engine')
    expect(p.rotation.y).toBeCloseTo(Math.PI / 2) // yawDeg 0 + the TRELLIS.2 offset 90: the front faces +z
    expect(p.scale.x).toBeCloseTo(4)
    const box = new THREE.Box3().setFromObject(p)
    const size = box.getSize(new THREE.Vector3())
    expect(size.z).toBeCloseTo(8, 3) // the box's 2-unit side at 4 m per unit, turned onto z
    expect(size.x).toBeCloseTo(2, 3)
    expect(size.y).toBeCloseTo(4, 3)
    expect(box.min.y).toBeCloseTo(w.groundAt(9, -14) - 0.5, 3) // base on the ground, sunk 0.5 m
    const c = box.getCenter(new THREE.Vector3())
    expect(c.x).toBeCloseTo(9, 3); expect(c.z).toBeCloseTo(-14, 3) // the off-centre mesh is centred on its place
    let clayed = 0
    p.traverse((o) => { if ((o as THREE.Mesh).isMesh) { clayed++; expect((o as THREE.Mesh).castShadow).toBe(true) } })
    expect(clayed).toBe(1)
    w.dispose()
  })

  it('the massing mesh is loaded too, hidden, aligned with the precise one; setMassing swaps them both ways', async () => {
    restore = setGlbLoader(fixtureLoader)
    const w = buildWorld(plan(piece({ glb: { ...piece().glb!, massingUrl: '/lab-assets/locations/loc-x/pieces/engine/p-1/massing.glb' } })))
    await w.ready
    expect(loads.sort()).toEqual(['/lab-assets/locations/loc-x/pieces/engine/p-1/massing.glb', '/lab-assets/locations/loc-x/pieces/engine/p-1/mesh.glb'])
    const kids = holderOf(w.scene).children[0].children
    const precise = kids.find((k) => k.userData[GLB_PRECISE])!, massing = kids.find((k) => k.userData[GLB_MASSING])!
    expect(precise.visible).toBe(true); expect(massing.visible).toBe(false)
    expect(massing.position.toArray()).toEqual(precise.position.toArray())
    expect(setMassing(w.scene, true)).toBe(1)
    expect(precise.visible).toBe(false); expect(massing.visible).toBe(true)
    setMassing(w.scene, false)
    expect(precise.visible).toBe(true); expect(massing.visible).toBe(false)
    w.dispose()
  })

  it('a piece without a massing mesh stays visible in massing mode (the precise mesh stands in)', async () => {
    restore = setGlbLoader(fixtureLoader)
    const w = buildWorld(plan(piece()))
    await w.ready
    expect(setMassing(w.scene, true)).toBe(0)
    expect(holderOf(w.scene).children[0].children[0].visible).toBe(true)
    w.dispose()
  })

  it('one mesh used twice is fetched once', async () => {
    restore = setGlbLoader(fixtureLoader)
    const w = buildWorld(plan(piece(), piece({ at: [-9, -14], pieceTag: 'prop:engine2' })))
    await w.ready
    expect(loads).toHaveLength(1)
    expect(holderOf(w.scene).children.map((c) => c.userData.entity)).toEqual(['prop:engine', 'prop:engine2'])
    w.dispose()
  })

  it('a mesh that does not load fails ready, naming the piece (a capture must not draw a set without it)', async () => {
    restore = setGlbLoader(async () => { throw new Error('HTTP 404') })
    const w = buildWorld(plan(piece()))
    await expect(w.ready).rejects.toThrow(/steam locomotive.*HTTP 404/)
    w.dispose()
  })

  it('a world disposed before its pieces land never adds them', async () => {
    let open: () => void = () => {}
    const gate = new Promise<void>((r) => { open = r })
    restore = setGlbLoader(async (u) => { await gate; return fixtureLoader(u) })
    const w = buildWorld(plan(piece()))
    w.dispose()
    open()
    await w.ready
    expect(holderOf(w.scene).children).toHaveLength(0)
  })

  it('code-built pieces still come from the KIT (an unknown kind without glb still throws)', () => {
    expect(() => buildWorld(plan({ kind: 'nope', at: [9, -9] }))).toThrow(/unknown kit piece nope/)
    const w = buildWorld(plan({ kind: 'barrels', at: [9, -9] }))
    expect(holderOf(w.scene).children).toHaveLength(0)
    w.dispose()
  })
})
