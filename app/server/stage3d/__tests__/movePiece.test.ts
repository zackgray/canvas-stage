// (recipe wave) A piece dragged or turned in Blocking's top view: a narrow move of one kit item (nothing else in the plan changes),
// refused when the plan moved under the page or the plan would not parse, and stamped as a set change (the master was drawn from
// another set) with the master view's depth dropped so the next master draw measures the set as it stands.
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { labStage3D, STAGE3D_ROUTE } from '../plugin.ts'
import { FILES, KitStore } from '../store.ts'

const URL = '/lab-assets/locations/loc-x/pieces/engine/p-1/mesh.glb'
function world() {
  const pub = mkdtempSync(path.join(tmpdir(), 'move-'))
  const s = new KitStore(pub)
  const plan: ScenePlan = { ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), kit: [
    { kind: 'barrels', at: [8, -10] },
    { kind: 'steam locomotive', at: [-9, -14], yawDeg: 10, pieceTag: 'prop:engine', glb: { url: URL, yawOffsetDeg: 90, unitScale: 5 } },
  ] }
  const w = s.create({ plan, description: 'move' })
  writeFileSync(path.join(s.dir(w.id), FILES.masterDepth), 'x')
  return { pub, s, id: w.id, plan }
}

describe('moving a set piece', () => {
  it('moves and turns exactly one item, stamps the set changed and drops the master depth', () => {
    const { s, id, plan } = world()
    const at = new Date('2026-10-24T21:00:00Z')
    const w = s.movePiece(id, { index: 1, kind: 'steam locomotive', at: [-11.234, -18], yawDeg: 200 }, at)
    expect(w.plan.kit[1]).toEqual({ ...plan.kit[1], at: [-11.23, -18], yawDeg: -160 })
    expect(w.plan.kit[0]).toEqual(plan.kit[0])
    expect(s.setChangedAt(id)).toBe(at.toISOString())
    expect(existsSync(path.join(s.dir(id), FILES.masterDepth))).toBe(false)
    expect(w.masterDepth).toBeNull()
  })

  it('a move to where the piece already stands is no change: nothing stamped, the master depth kept (Shoot and Render agree)', () => {
    const { s, id, plan } = world()
    const w = s.movePiece(id, { index: 1, kind: 'steam locomotive', at: plan.kit[1].at, yawDeg: plan.kit[1].yawDeg })
    expect(w.plan).toEqual(s.read(id).plan)
    expect(s.setChangedAt(id)).toBeNull()
    expect(existsSync(path.join(s.dir(id), FILES.masterDepth))).toBe(true)
  })

  it('refuses a stale index (409), a bad body (400) and a move the plan refuses (422), writing nothing', () => {
    const { s, id } = world()
    expect(() => s.movePiece(id, { index: 0, kind: 'steam locomotive', at: [1, 1] })).toThrow(/the set changed/)
    expect(() => s.movePiece(id, { index: 9, kind: 'barrels', at: [1, 1] })).toThrow(/the set changed/)
    expect(() => s.movePiece(id, { index: 0, kind: 'barrels', at: ['a', 1] })).toThrow(/at must be/)
    // a piece the plan itself refuses (outside the ground limits) is still a 422, nothing written
    try { s.movePiece(id, { index: 0, kind: 'barrels', at: [0, -400] }); expect.unreachable() } catch (e) {
      expect((e as { status: number }).status).toBe(422)
    }
    expect(s.read(id).plan.kit[0].at).toEqual([8, -10])
    expect(s.setChangedAt(id)).toBeNull()
  })

  it('a drag into the walking lane saves (the lane is advice, not a rule) and the world still reads back', () => {
    const { s, id } = world()
    s.movePiece(id, { index: 0, kind: 'barrels', at: [0, -10] })
    expect(s.read(id).plan.kit[0].at).toEqual([0, -10])
    expect(s.setChangedAt(id)).not.toBeNull()
  })

  it('POST /piece?id= is the route, local pages only', async () => {
    const { pub, id } = world()
    type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
    let h: Handler | null = null
    const plugin = labStage3D({}, { publicDir: pub }) as unknown as { configureServer: (s: unknown) => void }
    plugin.configureServer({ middlewares: { use: (_p: string, fn: Handler) => { h = fn } } })
    const server = createServer((req, res) => { req.url = req.url!.slice(STAGE3D_ROUTE.length) || '/'; h!(req, res, () => res.end()) })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${STAGE3D_ROUTE}`
      const r = await fetch(`${base}/piece?id=${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ index: 1, kind: 'steam locomotive', at: [-12, -20] }) })
      expect(r.status).toBe(200)
      expect(((await r.json()) as { plan: ScenePlan }).plan.kit[1].at).toEqual([-12, -20])
      const foreign = await fetch(`${base}/piece?id=${id}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' })
      expect(foreign.status).toBe(403)
    } finally { server.close() }
  })
})

describe('a piece moved after the master and the lock (join: PIECES x CARRY x the Set step)', () => {
  it('the Set step flags the master, and the frame-0 key changes, so a re-lock carries nothing', async () => {
    const { frame0Key } = await import('../../../src/studio/shoot/frame0Key.ts')
    const { piecesMovedSince } = await import('../../../src/studio/scene/SetGuards.tsx')
    const { carryRefusal } = await import('../../../src/shared/carryContract.ts')
    const { s, id } = world()
    const cam = { t: 0, position: [0, 1.4, 6] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 50, focus: 5 }
    const req = { samples: Array.from({ length: 30 }, (_, i) => ({ ...cam, t: i / 24 })), timelineStart: 0.5, viewAspect: 16 / 9, focal: 50, frames: 9, perfStart: 12 }
    const keyNow = () => frame0Key(req, { fps: 24, frames: 400 }, null, { plan: s.read(id).plan, look: null })
    const before = keyNow()
    const masterAt = '2026-10-24T20:00:00.000Z'
    s.movePiece(id, { index: 1, kind: 'steam locomotive', at: [-11, -18] }, new Date('2026-10-24T21:00:00Z'))
    expect(piecesMovedSince(s.setChangedAt(id), masterAt)).toBe(true)
    const after = keyNow()
    expect(after).not.toBe(before)
    const take = { id: 'take-1', worldId: id, focal: 50, viewAspect: 16 / 9, startKey: 'k', frame0Key: before! }
    expect(carryRefusal(take as never, { ...take, id: 'take-2', frame0Key: after! } as never)).toBe('frame 0 changed')
  })
})

describe('enlarging a tree whose crown reaches the lane (the run-4 case)', () => {
  it('is accepted, and the world reads back', () => {
    const { s, id } = world()
    s.movePiece(id, { add: { kind: 'tree', at: [2.25, -18.7] } })
    const w = s.movePiece(id, { index: 2, kind: 'tree', scale: 1.15 * 1.15 })
    expect(w.plan.kit[2].scale).toBeCloseTo(1.32, 1)
    expect(s.read(id).plan.kit[2].kind).toBe('tree')
  })
})
