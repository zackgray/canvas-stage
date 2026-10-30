// The lab load effect's branch: a kit shot (as the locations manifest lists it) takes the kit path, a bank shot the still + depth
// path; the kit path empties the projected set and sets the master lens. And the kit layer on a StageScene-shaped host.
import { Group, Mesh, MeshBasicMaterial, BoxGeometry, Scene, FogExp2, SphereGeometry } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { KIT_MASTER_MM, KIT_MASTER_POSITION, KIT_MASTER_TARGET } from '../../../../../server/stage3d/master'
import { kitShot } from '../../../../../server/stage3d/store'
import { BATTLEFIELD, WALK_TOWARD } from '../../../../stage3d/presets'
import { parseManifest } from '../../engine/manifest'
import { PROJECTOR_POSITION, PROJECTOR_TARGET } from '../../engine/stageScene'
import { isKitShot } from '../kitApi'
import { KIT_SKY, KitLayer } from '../KitLayer'
import { loadKitSource, sourcePath } from '../kitSource'

const ID = 'loc-2026-10-23T03-00-01-000'
const URL = '/lab-assets/locations/manifest.json'
const bank = { id: 'loc-2026-10-21T20-27-13-766', image: '/x/still.png', width: 1920, height: 1088, prompt: 'p', seed: 1, depths: [{ model: 'moge-2', path: '/d.png' }] }

describe('load effect branch', () => {
  const shots = parseManifest(JSON.stringify({ shots: [bank, kitShot(ID, { description: 'a kit world', plan: BATTLEFIELD })] }), URL)!

  it('keeps a kit shot in the manifest (no depths) and sends it down the kit path; a bank shot keeps the still + depth path', () => {
    expect(shots.map((s) => s.id)).toEqual([bank.id, ID])
    expect(isKitShot(shots[1])).toBe(true)
    expect(sourcePath(shots[1])).toBe('kit')
    expect(sourcePath(shots[0])).toBe('bank')
    expect(sourcePath(undefined)).toBe('bank')
  })

  it('the kit path empties the set and puts the master lens on the projector', () => {
    const stage = { setProjectorLens: vi.fn(), setSource: vi.fn(), rebuild: vi.fn() }
    const line = loadKitSource(stage, shots[1], { step: 4 })
    expect(stage.setProjectorLens).toHaveBeenCalledWith(KIT_MASTER_MM, 1920 / 1088)
    expect(stage.setSource).toHaveBeenCalledWith(null)
    expect(stage.rebuild).toHaveBeenCalledWith({ step: 4 })
    expect(line).toContain('kit world')
  })

  it('the master camera is the stage\'s default projector, so a snap shows the master still', () => {
    expect(KIT_MASTER_POSITION).toEqual(PROJECTOR_POSITION.toArray())
    expect(KIT_MASTER_TARGET).toEqual(PROJECTOR_TARGET.toArray())
  })
})

describe('KitLayer', () => {
  function world() {
    const scene = new Scene()
    scene.fog = new FogExp2(0x8b8f96, 0.018)
    const sky = new Mesh(new SphereGeometry(1000, 8, 4), new MeshBasicMaterial())
    sky.renderOrder = -1
    const box = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const g = new Group(); g.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
    scene.add(sky, box, g)
    return { scene, groundAt: () => 0, ready: Promise.resolve(), dispose: () => {}, sky, box }
  }

  it('moves the world into one group, takes its fog, flags the sky and picks the kit meshes only', () => {
    const w = world()
    const k = new KitLayer(w, ID, BATTLEFIELD, WALK_TOWARD)
    expect(w.scene.children).toHaveLength(0)
    expect(k.group.children).toHaveLength(3)
    expect(k.fog).toBeInstanceOf(FogExp2)
    expect(k.sky).toBe(w.sky)
    expect(w.sky.userData[KIT_SKY]).toBe(true)
    const picks = k.meshes()
    expect(picks).toHaveLength(2)
    expect(picks).not.toContain(w.sky)
    const host = new Scene(); host.add(k.group)
    k.dispose()
    expect(k.group.parent).toBeNull()
  })
})
