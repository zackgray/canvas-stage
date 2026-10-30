// Each take keeps its own set (PLAN-PER-TAKE-SET.md, S2): the still's readers and guards on a kit take. A take that holds its own set
// composes its words from its own pieces after the scene's set moves on (every reader goes through takeKitWorldFor); a clay stamped
// with another set gives the still no depth, so the press is refused free; the set approval gate passes a take whose own set was
// approved, whatever the scene's set is now, and still refuses an unapproved one; "Draw from the master, projected" is refused when
// the take's set is not the scene's (the master is the scene's). Fake Cloud, temp files: nothing paid.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { biblePaths } from '../../../src/shared/bibleContract.ts'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { SET_CHANGED, SET_NOT_APPROVED } from '../../../src/shared/setApproval.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { BibleStore } from '../../bible/store.ts'
import { approvedSetKeys } from '../../bible/setKeys.ts'
import { KitStore } from '../../stage3d/store.ts'
import { takeKitWorldFor } from '../../stage3d/takeKitWorldFor.ts'
import { masterSources, PROJECTED_OFF_SET } from '../projectedView.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

const LOOK = { position: [0.6, 1.5, -7.7] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24 }
const takeFile = (t: KitTake) => path.join(t.shot, 'take.json')
const readTakeJson = (t: KitTake) => JSON.parse(readFileSync(takeFile(t), 'utf8'))
const code = (r: { body: unknown }) => (r.body as { code?: string }).code
const error = (r: { body: unknown }) => (r.body as { error?: string }).error
const promptOf = async (t: KitTake) => {
  const r = await mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE }) })
  expect(r.status).toBe(200)
  return (r.body as unknown as StillPreviewResponse).prompt
}
const press = (t: KitTake) => {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()))
  return mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({})
}
const label = (t: KitTake, words: string) => {
  const store = new KitStore(t.pub)
  const index = store.read(t.kit.id).plan.kit.findIndex((k) => k.kind === 'palisade')
  store.movePiece(t.kit.id, { index, kind: 'palisade', label: words })
}
/** the take holds a copy of the scene's set as it is now (as Lock take stores it) */
function ownSet(t: KitTake) {
  const store = new KitStore(t.pub)
  const plan = store.read(t.kit.id).plan
  writeFileSync(takeFile(t), JSON.stringify({ ...readTakeJson(t), setKey: setKeyOf(plan), set: plan, setFrom: 'lock', setSince: store.setChangedAt(t.kit.id) }))
  return setKeyOf(plan)!
}
const readSetApprovalKey = (t: KitTake) => JSON.parse(readFileSync(path.join(t.pub, ...biblePaths(t.kit.id).root.split('/'), 'set-approval.json'), 'utf8')).key
const approve = (t: KitTake) =>new BibleStore(t.pub).approveSet(t.kit.id, setKeyOf(new KitStore(t.pub).read(t.kit.id).plan)!)

describe('a take with its own set after a prop moves on the scene', () => {
  it('composes the still\'s words from its own pieces; a take with no copy reads the scene\'s', async () => {
    const t = kitTake({ bible: {}, take: { samples: [{ t: 0, ...LOOK, focus: 6 }, { t: 0.5, ...LOOK }, { t: 1, ...LOOK }], focal: 24, action: '' } })
    label(t, 'a tall hawthorn hedge')
    await approve(t)
    ownSet(t)
    expect(await promptOf(t)).toMatch(/a tall hawthorn hedge/)
    label(t, 'a low stone wall') // the scene's set moves on (the take has a copy: adoption leaves it)
    await approve(t)
    expect(takeKitWorldFor(t.pub, readTakeJson(t))!.setState).toBe('own')
    const words = await promptOf(t)
    expect(words).toMatch(/a tall hawthorn hedge/)
    expect(words).not.toMatch(/stone wall/)
    // the same take with no copy (locked before copies, its set moved since): the scene's set, as before
    const { set: _s, setFrom: _f, setSince: _g, ...legacy } = readTakeJson(t) // eslint-disable-line @typescript-eslint/no-unused-vars
    writeFileSync(takeFile(t), JSON.stringify(legacy))
    expect(takeKitWorldFor(t.pub, legacy)!.setState).toBe('unmatched')
    expect(await promptOf(t)).toMatch(/a low stone wall/)
    expect(t.jobs.submits).toBe(0)
  })
})

describe('the still press on a take with its own set', () => {
  it('a clay stamped with another set gives no depth: refused free', async () => {
    const t = kitTake()
    const key = ownSet(t)
    const clay = path.join(t.clayDir, 'clay.json')
    writeFileSync(clay, JSON.stringify({ ...JSON.parse(readFileSync(clay, 'utf8')), setKey: 'deadbeef' }))
    const r = await press(t)
    expect([r.status, code(r), t.jobs.submits, t.jobs.ledger()]).toEqual([409, 'no_depth', 0, ''])
    writeFileSync(clay, JSON.stringify({ ...JSON.parse(readFileSync(clay, 'utf8')), setKey: key }))
    expect(code(await press(t))).not.toBe('no_depth')
  })

  it('the approval gate passes its own set once approved, whatever the scene is now; refuses a set never approved', async () => {
    const t = kitTake({ depth: false, approved: false })
    await approve(t) // the take's set, approved through the store: its key goes in the list
    ownSet(t)
    new KitStore(t.pub).changeKit(t.kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
    // the scene's new set is not approved: a take on it is refused, the old take on its own approved set is not
    const r = await press(t)
    expect([r.status, code(r)]).toEqual([409, 'no_depth']) // past the gate, stopped at its own free check
    await approve(t) // approving the scene's new set keeps the old key in the list
    expect(approvedSetKeys(t.pub, t.kit.id)).toHaveLength(2)
    expect(code(await press(t))).toBe('no_depth')
    // a take holding a set that was never approved (its copy the scene's newest, unapproved) is refused, free
    new KitStore(t.pub).changeKit(t.kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
    ownSet(t)
    const refused = await press(t)
    expect([refused.status, code(refused), error(refused), t.jobs.submits]).toEqual([409, 'set_not_approved', SET_CHANGED, 0])
    // a take with no copy keeps the scene-level rule
    const { set: _s, setFrom: _f, setSince: _g, ...legacy } = readTakeJson(t) // eslint-disable-line @typescript-eslint/no-unused-vars
    writeFileSync(takeFile(t), JSON.stringify(legacy))
    expect(code(await press(t))).toBe('set_not_approved')
  })

  it('(review F1) an own set never approved is refused even when the scene\'s set is approved; approving its key lets it pass', async () => {
    const t = kitTake({ depth: false, approved: false })
    const own = ownSet(t) // locked on S0, never approved
    new KitStore(t.pub).changeKit(t.kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
    await approve(t) // the scene's new set S1 is approved
    const refused = await press(t)
    expect([refused.status, code(refused), error(refused), t.jobs.submits]).toEqual([409, 'set_not_approved', SET_CHANGED, 0])
    await new BibleStore(t.pub).approveSet(t.kit.id, own, { scene: false }) // the take's own set, approved by its key
    expect(code(await press(t))).toBe('no_depth') // past the gate
    expect(readSetApprovalKey(t)).toBe(setKeyOf(new KitStore(t.pub).read(t.kit.id).plan)) // the scene's approval stays the scene's
  })

  it('(review F1) Shot 1\'s shape: an approval file written before the keys list, its key the take\'s, still passes', async () => {
    const t = kitTake({ depth: false, approved: false })
    const own = ownSet(t)
    const file = path.join(t.pub, ...biblePaths(t.kit.id).root.split('/'), 'set-approval.json')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ key: own, at: '2026-10-28T10:00:00.000Z' }))
    new KitStore(t.pub).changeKit(t.kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
    expect(code(await press(t))).toBe('no_depth')
  })

  it('a world never approved refuses an own-set take too', async () => {
    const t = kitTake({ depth: false, approved: false })
    ownSet(t)
    const r = await press(t)
    expect([r.status, code(r), error(r)]).toEqual([409, 'set_not_approved', SET_NOT_APPROVED])
  })
})

describe('Draw from the master, projected', () => {
  it('is refused free when the take\'s set is not the scene\'s; the scene\'s own key gets past to its next check', () => {
    const t = kitTake()
    const key = setKeyOf(new KitStore(t.pub).read(t.kit.id).plan)!
    expect(() => masterSources(t.pub, { worldId: t.kit.id, setKey: 'deadbeef' })).toThrow(PROJECTED_OFF_SET)
    expect(() => masterSources(t.pub, { worldId: t.kit.id, setKey: key })).toThrow(/approve a master/)
    expect(() => masterSources(t.pub, { worldId: t.kit.id })).toThrow(/approve a master/) // no key: as before
  })
})
