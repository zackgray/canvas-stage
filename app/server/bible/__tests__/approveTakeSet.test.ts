// Review F1: POST /set/approve with a set key. The scene's current key approves as before; the own set of a locked take of this world
// joins the approved keys without moving the scene's approval; any other key is refused (409) and nothing is written. Temp files,
// nothing paid.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { biblePaths } from '../../../src/shared/bibleContract.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { kitTake, type KitTake } from '../../hero/__tests__/kitRig.ts'
import { KitStore } from '../../stage3d/store.ts'
import { readSetApproval } from '../read.ts'
import { handleBible, NOT_APPROVABLE } from '../routes.ts'
import { approvableSetKey, currentSetKey } from '../setGate.ts'
import { approvedSetKeys } from '../setKeys.ts'
import { BibleStore } from '../store.ts'

const takeFile = (t: KitTake) => path.join(t.shot, 'take.json')
/** the take holds a copy of the scene's set as it is now (as Lock take stores it); returns its key */
function ownSet(t: KitTake): string {
  const plan = new KitStore(t.pub).read(t.kit.id).plan
  writeFileSync(takeFile(t), JSON.stringify({ ...JSON.parse(readFileSync(takeFile(t), 'utf8')), setKey: setKeyOf(plan), set: plan, setFrom: 'lock' }))
  return setKeyOf(plan)!
}
const move = (t: KitTake) => new KitStore(t.pub).changeKit(t.kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
function route(t: KitTake) {
  const pub = t.pub
  const ctx = { store: new BibleStore(pub), setKey: (w: string) => currentSetKey(pub, w), setApproval: (w: string) => readSetApproval(pub, w),
    approvable: (w: string, k: unknown) => approvableSetKey(pub, w, k), approvedKeys: (w: string) => approvedSetKeys(pub, w) }
  return (body: object = {}) => handleBible(ctx, 'POST', '/set/approve', new URLSearchParams(), { worldId: t.kit.id, ...body })
}
const approvalFile = (t: KitTake) => path.join(t.pub, ...biblePaths(t.kit.id).root.split('/'), 'set-approval.json')

describe('approving a set by its key (review F1)', () => {
  it('a locked take\'s own set: approved into the keys, the scene\'s approval untouched; the reply lists the keys', async () => {
    const t = kitTake({ depth: false, approved: false })
    const own = ownSet(t)
    move(t)
    const scene = currentSetKey(t.pub, t.kit.id)!
    const call = route(t)
    expect((await call()).status).toBe(200) // the scene's set, as before
    const r = await call({ setKey: own })
    expect(r.status).toBe(200)
    expect(readSetApproval(t.pub, t.kit.id)?.key).toBe(scene)
    expect(approvedSetKeys(t.pub, t.kit.id)).toEqual([scene, own])
    expect((r.body as { setKeys?: string[] }).setKeys).toEqual([scene, own])
  })

  it('a take\'s set approved first, on a world never approved: the scene stays unapproved', async () => {
    const t = kitTake({ depth: false, approved: false })
    const own = ownSet(t)
    move(t)
    expect((await route(t)({ setKey: own })).status).toBe(200)
    expect(readSetApproval(t.pub, t.kit.id)).toBeNull()
    expect(approvedSetKeys(t.pub, t.kit.id)).toEqual([own])
  })

  it('an arbitrary key, or a take\'s key whose copy does not hash to it, is refused and nothing is written', async () => {
    const t = kitTake({ depth: false, approved: false })
    const call = route(t)
    const r = await call({ setKey: 'deadbeef' })
    expect([r.status, (r.body as { error: string }).error]).toEqual([409, NOT_APPROVABLE])
    expect(existsSync(approvalFile(t))).toBe(false)
    const own = ownSet(t)
    move(t)
    // the copy no longer hashes to the take's key: not a set the take holds
    const rec = JSON.parse(readFileSync(takeFile(t), 'utf8'))
    writeFileSync(takeFile(t), JSON.stringify({ ...rec, set: new KitStore(t.pub).read(t.kit.id).plan }))
    expect((await call({ setKey: own })).status).toBe(409)
    // a take on another world holding that set does not count either
    writeFileSync(takeFile(t), JSON.stringify({ ...rec, worldId: 'loc-2026-01-01T00-00-00-000' }))
    expect((await call({ setKey: own })).status).toBe(409)
    expect(existsSync(approvalFile(t))).toBe(false)
  })
})
