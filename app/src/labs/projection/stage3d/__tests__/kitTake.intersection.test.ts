// Intersection, kit world -> take lock: a kit world registered on disk (temp dir), its default performance built as the 3D performer
// on the world clock, a take recorded whole by the operator engine (the cap is the performer's duration), locked through the
// lock request the page sends and the server's own parse + store. The record carries the kit world, the mocap pack id, 24 fps
// and an 8k+1 frame count that fits the performance.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { KitStore } from '../../../../../server/stage3d/store'
import { parseLockRequest } from '../../../../../server/takes/request'
import { lockTake, readTake } from '../../../../../server/takes/store'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { lockRequest } from '../../clay/plan'
import { STAGE_RIGS } from '../../operator/link'
import { StageOperatorEngine } from '../../operator/stageEngine'
import { ASPECT, FRAME } from '../../operator/testRig'
import { World } from '../../world/World'
import { MocapLayer } from '../MocapLayer'
import { performer } from './performer'

const pub = path.join(mkdtempSync(path.join(tmpdir(), 'kit-take-')), 'public')
afterAll(() => { vi.unstubAllGlobals(); rmSync(path.dirname(pub), { recursive: true, force: true }) })

describe('kit world -> 3D performer -> recorded take -> lock', () => {
  it('locks a TakeRecord on the kit world with the mocap pack id and 8k+1 frames', async () => {
    const kit = new KitStore(pub).create({ plan: BATTLEFIELD, description: 'S-track test world' }, new Date('2026-10-23T03:00:00.000Z'))
    const layer = new MocapLayer(await performer(kit.perf), kit.perf, kit.id)
    const world = new World(async () => ({ missing: 'test' }))
    world.setPerformance(layer)
    const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    engine.bind(world, () => ASPECT)
    const frame = () => { engine.tick(FRAME, ASPECT); world.frame(0) }
    frame()
    engine.toggleRecording()
    for (let i = 0; i < 60 * (layer.duration + 2) && engine.deck.recording; i++) frame()
    expect(engine.deck.recording).toBe(false) // stopped by the performer's own length
    const take = engine.deck.take!

    const q = parseLockRequest(JSON.parse(JSON.stringify(lockRequest(take, layer.pack, kit.id, ASPECT))))
    if (typeof q === 'string') throw new Error(q)
    const { take: rec } = lockTake(pub, q, new Date('2026-10-23T03:01:00.000Z'))
    expect(rec).toMatchObject({ worldId: kit.id, packId: layer.pack.id, fps: 24, perfStart: 0 })
    expect(rec.worldId).toMatch(/^loc-/)
    expect(rec.packId).toMatch(/^mocap-[0-9a-f]{8}$/)
    expect((rec.frames - 1) % 8).toBe(0)
    expect(rec.frames).toBeGreaterThanOrEqual(9)
    expect(rec.frames).toBeLessThanOrEqual(layer.pack.frames)
    expect(layer.pack.frames - rec.frames).toBeLessThan(8 + 2) // the longest 8k+1 that fits the whole walk
    expect(readTake(pub, rec.id)).toEqual(rec)
  })
})
