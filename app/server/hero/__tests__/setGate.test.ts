// Guided wave, Track B: the hero-still press is refused free (409 set_not_approved, plain words) unless the set is approved at its
// current key. No job, no intent, no ledger row. An approved set reaches the press's own later checks (here: no clay depth).
import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SET_CHANGED, SET_NOT_APPROVED } from '../../../src/shared/setApproval.ts'
import { approveSetOnDisk } from '../../bible/__tests__/approveFixture.ts'
import { KitStore } from '../../stage3d/store.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount } from './rig.ts'

const press = (t: KitTake) => {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()))
  return mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({})
}
const intents = (t: KitTake) => (existsSync(t.heroDir) ? readdirSync(t.heroDir).filter((f) => f.startsWith('intent-')) : [])
const code = (r: { body: unknown }) => (r.body as { code?: string }).code
const error = (r: { body: unknown }) => (r.body as { error: string }).error

describe('the hero-still press needs the set approved', () => {
  it('an unapproved set: 409 set_not_approved in plain words, no job, no intent, no ledger row', async () => {
    const t = kitTake({ approved: false })
    const r = await press(t)
    expect([r.status, code(r), error(r)]).toEqual([409, 'set_not_approved', SET_NOT_APPROVED])
    expect([t.jobs.submits, t.jobs.ledger(), intents(t)]).toEqual([0, '', []])
  })
  it('approved: the press gets past the gate (it stops at its own no-depth check, still free)', async () => {
    const t = kitTake({ depth: false })
    const r = await press(t)
    expect([r.status, code(r)]).toEqual([409, 'no_depth'])
  })
  it('a piece moved after approving: refused again with the changed words; Approve again lets it through', async () => {
    const t = kitTake()
    new KitStore(t.pub).changeKit(t.kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)))
    const r = await press(t)
    expect([r.status, code(r), error(r)]).toEqual([409, 'set_not_approved', SET_CHANGED])
    expect([t.jobs.submits, t.jobs.ledger(), intents(t)]).toEqual([0, '', []])
    approveSetOnDisk(t.pub, t.kit.id)
    expect(code(await press(t))).not.toBe('set_not_approved')
  })
})
