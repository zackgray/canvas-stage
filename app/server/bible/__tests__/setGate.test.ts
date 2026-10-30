// Guided wave, Track B: the set approval gate. The master draw and the master preview refuse (409, plain words) before any job, claim,
// intent or ledger row unless the set is approved at its current key; the free approve route approves it; a piece moved makes the
// approval stale and the draw is refused again. Fake Cloud: nothing is billed.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths } from '../../../src/shared/bibleContract.ts'
import { SET_CHANGED, SET_NOT_APPROVED } from '../../../src/shared/setApproval.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { kitInfo, pngJob, stillPng, zdepthPng } from '../../hero/__tests__/kitRig.ts'
import { world } from '../../hero/__tests__/rig.ts'
import { FILES, KitStore } from '../../stage3d/store.ts'
import { masterDrawer } from '../masterDraw.ts'
import { previewMaster } from '../masterPreview.ts'
import { completeMasters } from '../masterIntents.ts'
import { readSetApproval } from '../read.ts'
import { handleBible } from '../routes.ts'
import { currentSetKey } from '../setGate.ts'
import { BibleStore } from '../store.ts'

afterEach(() => resetClaims())

function setup() {
  const w = world()
  const kits = new KitStore(w.pub)
  const kit = kits.create({ plan: BATTLEFIELD, description: 'set gate test' })
  writeFileSync(path.join(w.pub, 'lab-assets', 'locations', kit.id, FILES.masterDepth), zdepthPng())
  const store = new BibleStore(w.pub)
  const rt = w.runtime({ fetchInfo: async () => kitInfo() })
  const draw = masterDrawer({ publicDir: w.pub, store, runtime: () => rt, seed: () => 100, now: () => new Date('2026-10-26T10:00:00Z') })
  const ctx = { store, drawMaster: draw, complete: (id: string) => completeMasters(w.pub, store, rt.store, id),
    previewMaster: (b: Parameters<typeof previewMaster>[2], body: unknown) => previewMaster(w.pub, store, b, body),
    setKey: (id: string) => currentSetKey(w.pub, id), setApproval: (id: string) => readSetApproval(w.pub, id) }
  const call = (sub: string, body: object = {}) => handleBible(ctx, 'POST', sub, new URLSearchParams(), { worldId: kit.id, ...body })
  const move = () => kits.changeKit(kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
  const nothingSpent = () => {
    const master = path.join(w.pub, ...biblePaths(kit.id).master.split('/'))
    return [w.jobs.submits, w.jobs.ledger(), existsSync(master) ? readdirSync(master) : []]
  }
  return { w, kit, store, call, move, nothingSpent }
}
const err = (r: { body: unknown }) => (r.body as { error: string }).error

describe('the set approval gate on the master draw and its preview', () => {
  it('an unapproved set: the draw is 409 in plain words, with no job, no ledger row, no intent', async () => {
    const s = setup()
    const r = await s.call('/master', { count: 2 })
    expect([r.status, err(r)]).toEqual([409, SET_NOT_APPROVED])
    expect(s.nothingSpent()).toEqual([0, '', []])
  })
  it('the preview is refused the same way (free), so the Look phase shows nothing for an unapproved set', async () => {
    const s = setup()
    const r = await s.call('/master/preview', {})
    expect([r.status, err(r)]).toEqual([409, SET_NOT_APPROVED])
  })
  it('approve is free and leaves the sheet alone (no new version); then the draw and the preview are allowed', async () => {
    const s = setup()
    const a = await s.call('/set/approve')
    expect(a.status).toBe(200)
    const key = setKeyOf(new KitStore(s.w.pub).read(s.kit.id).plan)
    expect((a.body as { setApproval: { key: string } }).setApproval.key).toBe(key) // the key Shoot computes, not a second one
    expect(readSetApproval(s.w.pub, s.kit.id)?.key).toBe(key)
    expect(existsSync(path.join(s.w.pub, ...biblePaths(s.kit.id).root.split('/'), 'bible.json'))).toBe(false) // nothing was written to the sheet
    expect(s.nothingSpent()).toEqual([0, '', []])
    expect((await s.call('/master/preview', {})).status).toBe(200)
    s.w.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000c01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000c02', stillPng()))
    const d = await s.call('/master', { count: 2 })
    expect(d.status).toBe(200)
    expect(s.w.jobs.submits).toBe(1)
  })
  it('a piece moved after approving: the approval is stale, the draw and the preview are refused again, Approve again (free) allows it', async () => {
    const s = setup()
    await s.call('/set/approve')
    s.move()
    const r = await s.call('/master', { count: 1 })
    expect([r.status, err(r)]).toEqual([409, SET_CHANGED])
    expect(s.nothingSpent()).toEqual([0, '', []])
    expect((await s.call('/master/preview', {})).status).toBe(409)
    const again = await s.call('/set/approve')
    expect((again.body as { setApproval: { key: string } }).setApproval.key).toBe(currentSetKey(s.w.pub, s.kit.id))
    expect((await s.call('/master/preview', {})).status).toBe(200)
  })
  it('approving a world with no set is a plain 409; an unknown world is refused', async () => {
    const s = setup()
    const r = await handleBible({ store: s.store, setKey: () => null }, 'POST', '/set/approve', new URLSearchParams(), { worldId: s.kit.id })
    expect([r.status, err(r)]).toEqual([409, 'This scene has no set to approve yet. Build the set first.'])
    expect((await handleBible({ store: s.store, setKey: () => 'abcd0001' }, 'POST', '/set/approve', new URLSearchParams(), { worldId: 'loc-2026-01-01T00-00-00-000' })).status).toBe(404)
  })
  it('GET carries the approval beside the sheet; a world never approved reads null', async () => {
    const s = setup()
    const get = async () => (await handleBible({ store: s.store, setApproval: (id) => readSetApproval(s.w.pub, id) }, 'GET', '', new URLSearchParams({ world: s.kit.id }), null)).body as { setApproval: unknown }
    expect((await get()).setApproval).toBeNull()
    await s.call('/set/approve')
    expect((await get()).setApproval).toMatchObject({ key: currentSetKey(s.w.pub, s.kit.id) })
    expect(JSON.parse(readFileSync(path.join(s.w.pub, ...biblePaths(s.kit.id).root.split('/'), 'set-approval.json'), 'utf8')).key).toBe(currentSetKey(s.w.pub, s.kit.id))
  })
})
